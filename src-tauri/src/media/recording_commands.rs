use super::recording::{digest, PruneResult, RecordingMeta, RecordingStore, StorageUsage};
use crate::error::TingxuError;
use serde::{Deserialize, Serialize};
use std::{
    fs,
    path::PathBuf,
    sync::{
        atomic::{AtomicU64, Ordering},
        Mutex,
    },
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::Manager;
pub struct LocalMedia {
    pub store: Mutex<Option<RecordingStore>>,
    pub generation: AtomicU64,
    token_hash: Mutex<Option<String>>,
}
impl Default for LocalMedia {
    fn default() -> Self {
        Self {
            store: Mutex::new(None),
            generation: AtomicU64::new(0),
            token_hash: Mutex::new(None),
        }
    }
}
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct VerifiedIdentity {
    user_id: String,
    expires_at: u64,
}
#[derive(Serialize, Deserialize)]
struct CachedIdentity {
    token_hash: String,
    identity: VerifiedIdentity,
}
fn error() -> TingxuError {
    TingxuError::permission_denied("录音身份校验失败，请重新登录或检查本机控制面")
}
fn root(app: &tauri::AppHandle) -> Result<PathBuf, TingxuError> {
    app.path()
        .app_data_dir()
        .map(|p| p.join("recordings-v1"))
        .map_err(|_| error())
}
fn with_store<T>(
    state: &LocalMedia,
    f: impl FnOnce(&mut RecordingStore) -> Result<T, TingxuError>,
) -> Result<T, TingxuError> {
    let mut lock = state.store.lock().map_err(|_| error())?;
    f(lock.as_mut().ok_or_else(error)?)
}
#[tauri::command]
pub async fn bind_recording_identity(
    app: tauri::AppHandle,
    state: tauri::State<'_, LocalMedia>,
    token: String,
) -> Result<u64, TingxuError> {
    let hash = digest(token.as_bytes());
    let generation = {
        let mut lock = state.store.lock().map_err(|_| error())?;
        let mut active = state.token_hash.lock().map_err(|_| error())?;
        if active.as_deref() == Some(hash.as_str())
            && lock.as_ref().map(|s| s.is_bound()).unwrap_or(false)
        {
            return Ok(state.generation.load(Ordering::SeqCst));
        }
        *active = None;
        if let Some(store) = lock.as_mut() {
            store.clear();
        }
        state.generation.fetch_add(1, Ordering::SeqCst) + 1
    };
    if token.len() > 8192 || token.is_empty() {
        return Err(error());
    }
    let base = root(&app)?;
    fs::create_dir_all(&base)?;
    let cache = base.join(format!("identity-{hash}.json"));
    let cached = fs::read(&cache)
        .ok()
        .and_then(|v| serde_json::from_slice::<CachedIdentity>(&v).ok());
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|_| error())?
        .as_secs();
    let identity =
        if let Some(c) = cached.filter(|c| c.token_hash == hash && c.identity.expires_at > now) {
            c.identity
        } else {
            // 与现有登录控制面同一固定地址；禁止 Webview 传入远端 URL 窃取凭据。
            let client = reqwest::Client::builder()
                .timeout(std::time::Duration::from_secs(5))
                .redirect(reqwest::redirect::Policy::none())
                .build()
                .map_err(|_| error())?;
            // debug 构建可绑定隔离的本机验收控制面；release 地址固定。
            #[cfg(debug_assertions)]
            let endpoint = option_env!("TINGXU_TEST_SESSION_ENDPOINT")
                .unwrap_or("http://127.0.0.1:3200/v1/auth/session");
            #[cfg(not(debug_assertions))]
            let endpoint = "http://127.0.0.1:3200/v1/auth/session";
            let response = client
                .get(endpoint)
                .bearer_auth(&token)
                .send()
                .await
                .map_err(|_| error())?;
            if !response.status().is_success() {
                return Err(error());
            }
            #[derive(Deserialize)]
            struct Reply {
                data: VerifiedIdentity,
            }
            let identity = response.json::<Reply>().await.map_err(|_| error())?.data;
            if identity.user_id.is_empty() || identity.expires_at <= now {
                return Err(error());
            }
            let bytes = serde_json::to_vec(&CachedIdentity {
                token_hash: hash.clone(),
                identity: VerifiedIdentity {
                    user_id: identity.user_id.clone(),
                    expires_at: identity.expires_at,
                },
            })
            .map_err(|_| error())?;
            fs::write(&cache, bytes)?;
            identity
        };
    let mut lock = state.store.lock().map_err(|_| error())?;
    if state.generation.load(Ordering::SeqCst) != generation {
        return Err(error());
    }
    if lock.is_none() {
        *lock = Some(RecordingStore::new(base)?);
    }
    lock.as_mut()
        .ok_or_else(error)?
        .bind(identity.user_id, identity.expires_at);
    *state.token_hash.lock().map_err(|_| error())? = Some(hash);
    Ok(generation)
}
#[tauri::command]
pub fn clear_recording_identity(state: tauri::State<'_, LocalMedia>) -> Result<(), TingxuError> {
    let mut lock = state.store.lock().map_err(|_| error())?;
    state.generation.fetch_add(1, Ordering::SeqCst);
    *state.token_hash.lock().map_err(|_| error())? = None;
    if let Some(s) = lock.as_mut() {
        s.clear();
    }
    Ok(())
}
#[tauri::command]
pub fn start_local_recording(
    state: tauri::State<'_, LocalMedia>,
    identity: u64,
) -> Result<String, TingxuError> {
    with_store(&state, |s| {
        if state.generation.load(Ordering::SeqCst) != identity {
            return Err(error());
        }
        s.start()
    })
}
#[tauri::command]
pub fn append_local_recording(
    state: tauri::State<'_, LocalMedia>,
    id: String,
    pcm: Vec<u8>,
) -> Result<(), TingxuError> {
    with_store(&state, |s| s.append(&id, pcm))
}
#[tauri::command]
pub async fn checkpoint_local_recording(
    app: tauri::AppHandle,
    id: String,
) -> Result<u64, TingxuError> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<LocalMedia>();
        with_store(&state, |s| s.checkpoint(&id))
    })
    .await
    .map_err(|_| error())?
}

#[tauri::command]
pub async fn finish_local_recording(
    app: tauri::AppHandle,
    id: String,
) -> Result<RecordingMeta, TingxuError> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<LocalMedia>();
        with_store(&state, |s| s.finish(&id))
    })
    .await
    .map_err(|_| error())?
}

#[tauri::command]
pub async fn open_local_recording(
    app: tauri::AppHandle,
    id: String,
    identity: u64,
) -> Result<String, TingxuError> {
    let (dir, generation) = {
        let state = app.state::<LocalMedia>();
        let dir = with_store(&state, |s| {
            if state.generation.load(Ordering::SeqCst) != identity {
                return Err(error());
            }
            s.recording_dir(&id)
        })?;
        (dir, state.generation.load(Ordering::SeqCst))
    };
    let path =
        tauri::async_runtime::spawn_blocking(move || RecordingStore::validate_recording_dir(&dir))
            .await
            .map_err(|_| error())??;
    let state = app.state::<LocalMedia>();
    let mut lock = state.store.lock().map_err(|_| error())?;
    if state.generation.load(Ordering::SeqCst) != generation {
        return Err(error());
    }
    lock.as_mut().ok_or_else(error)?.register_lease(&id, path)
}

#[tauri::command]
pub fn release_local_recording(
    state: tauri::State<'_, LocalMedia>,
    lease: String,
) -> Result<(), TingxuError> {
    with_store(&state, |s| {
        s.release(&lease);
        Ok(())
    })
}

#[tauri::command]
pub fn delete_local_recording(
    state: tauri::State<'_, LocalMedia>,
    id: String,
    identity: u64,
) -> Result<(), TingxuError> {
    with_store(&state, |s| {
        if state.generation.load(Ordering::SeqCst) != identity {
            return Err(error());
        }
        s.delete(&id)
    })
}

#[tauri::command]
pub fn get_recording_storage_usage(
    state: tauri::State<'_, LocalMedia>,
    identity: u64,
) -> Result<StorageUsage, TingxuError> {
    with_store(&state, |s| {
        if state.generation.load(Ordering::SeqCst) != identity {
            return Err(error());
        }
        s.storage_usage()
    })
}

#[tauri::command]
pub fn prune_local_recordings(
    state: tauri::State<'_, LocalMedia>,
    identity: u64,
    older_than_secs: Option<u64>,
    target_ids: Option<Vec<String>>,
) -> Result<PruneResult, TingxuError> {
    with_store(&state, |s| {
        if state.generation.load(Ordering::SeqCst) != identity {
            return Err(error());
        }
        s.prune(older_than_secs, target_ids)
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn stale_identity_generation_cannot_start_a_writer() {
        let path = std::env::temp_dir().join(format!("tx-identity-{}", uuid::Uuid::new_v4()));
        let state = LocalMedia::default();
        let mut store = RecordingStore::new(path.clone()).expect("test directory");
        store.bind("account-b".into(), u64::MAX);
        *state.store.lock().expect("test lock") = Some(store);
        state.generation.store(2, Ordering::SeqCst);
        let stale = 1;
        let result = with_store(&state, |s| {
            if state.generation.load(Ordering::SeqCst) != stale {
                return Err(error());
            }
            s.start()
        });
        assert!(result.is_err());
        std::fs::remove_dir_all(path).expect("test cleanup");
    }
}
