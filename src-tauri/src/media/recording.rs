use crate::error::TingxuError;
use crossbeam_channel::{bounded, Sender};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    collections::HashMap,
    fs::{self, File},
    io::{Read, Seek, SeekFrom, Write},
    path::{Path, PathBuf},
    thread,
    time::{SystemTime, UNIX_EPOCH},
};
fn now() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}
pub fn digest(value: &[u8]) -> String {
    Sha256::digest(value)
        .iter()
        .map(|b| format!("{b:02x}"))
        .collect()
}
fn denied() -> TingxuError {
    TingxuError::permission_denied("本机录音不可访问，请重新登录")
}
fn valid_id(id: &str) -> bool {
    id.len() == 32 && id.bytes().all(|b| b.is_ascii_hexdigit())
}
#[derive(Clone, Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct RecordingMeta {
    pub id: String,
    pub samples: u64,
    pub sample_rate: u32,
}
#[derive(Clone, Serialize, Deserialize, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct StorageUsage {
    pub total_bytes: u64,
    pub recording_count: u32,
}
#[derive(Clone, Serialize, Deserialize, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PruneResult {
    pub freed_bytes: u64,
    pub deleted_count: u32,
    pub deleted_ids: Vec<String>,
}
#[derive(Serialize, Deserialize)]
struct Slice {
    index: u64,
    start_sample: u64,
    samples: u64,
    sha256: String,
}
#[derive(Default, Serialize, Deserialize)]
struct Manifest {
    slices: Vec<Slice>,
    samples: u64,
    complete: bool,
}
enum Message {
    Pcm(Vec<u8>),
    Flush(Sender<Result<u64, TingxuError>>),
    Finish(Sender<Result<RecordingMeta, TingxuError>>),
}
struct Writer {
    sender: Sender<Message>,
}
pub struct RecordingStore {
    root: PathBuf,
    identity: Option<(String, u64)>,
    writers: HashMap<String, Writer>,
    leases: HashMap<String, PathBuf>,
}
impl RecordingStore {
    pub fn new(root: PathBuf) -> Result<Self, TingxuError> {
        fs::create_dir_all(&root)?;
        Ok(Self {
            root: root.canonicalize()?,
            identity: None,
            writers: HashMap::new(),
            leases: HashMap::new(),
        })
    }
    // 仅由原生校验后的身份调用，Tauri 命令不接收 accountId。
    pub fn bind(&mut self, account: String, expires: u64) {
        if self.identity.as_ref().map(|v| &v.0) != Some(&account) {
            self.clear();
        }
        self.identity = Some((account, expires));
    }
    pub fn is_bound(&self) -> bool {
        self.account_dir().is_ok()
    }
    pub fn clear(&mut self) {
        self.identity = None;
        self.leases.clear();
        self.writers.clear();
    }
    fn account_dir(&self) -> Result<PathBuf, TingxuError> {
        let (account, exp) = self.identity.as_ref().ok_or_else(denied)?;
        if *exp <= now() {
            return Err(denied());
        }
        Ok(self.root.join(digest(account.as_bytes())))
    }
    fn dir(&self, id: &str) -> Result<PathBuf, TingxuError> {
        if !valid_id(id) {
            return Err(denied());
        }
        let account = self.account_dir()?;
        let dir = account.join(id).canonicalize().map_err(|_| denied())?;
        if !dir.starts_with(&self.root) || dir.parent() != Some(account.as_path()) {
            return Err(denied());
        }
        Ok(dir)
    }
    pub fn start(&mut self) -> Result<String, TingxuError> {
        let account = self.account_dir()?;
        fs::create_dir_all(&account)?;
        if account.canonicalize()?.parent() != Some(self.root.as_path()) {
            return Err(denied());
        }
        if !self.writers.is_empty() {
            return Err(TingxuError::buffer_overflow("已有录音会话"));
        }
        let id = uuid::Uuid::new_v4().simple().to_string();
        let dir = account.join(&id);
        fs::create_dir(&dir)?;
        let (sender, receiver) = bounded(32);
        let worker_id = id.clone();
        thread::Builder::new()
            .name("tingxu-recording".into())
            .spawn(move || {
                let mut manifest = Manifest::default();
                let mut pending = Vec::with_capacity(64000);
                let mut failure: Option<TingxuError> = None;
                for message in receiver {
                    match message {
                        Message::Pcm(bytes) => {
                            if failure.is_none() {
                                pending.extend(bytes);
                                while pending.len() >= 64000 {
                                    let tail = pending.split_off(64000);
                                    if let Err(e) = flush_slice(&dir, &mut manifest, &pending) {
                                        failure = Some(e);
                                        break;
                                    }
                                    pending = tail;
                                }
                            }
                        }
                        Message::Flush(reply) => {
                            let result = if let Some(e) = &failure {
                                Err(e.clone())
                            } else {
                                flush_slice(&dir, &mut manifest, &pending).map(|_| {
                                    pending.clear();
                                    manifest.samples
                                })
                            };
                            if let Err(e) = &result {
                                failure = Some(e.clone());
                            }
                            let _ = reply.send(result);
                        }
                        Message::Finish(reply) => {
                            let result = if let Some(e) = failure.take() {
                                Err(e)
                            } else {
                                flush_slice(&dir, &mut manifest, &pending).and_then(|_| {
                                    manifest.complete = true;
                                    write_manifest(&dir, &manifest)?;
                                    build_wav(&dir, &manifest)?;
                                    Ok(RecordingMeta {
                                        id: worker_id.clone(),
                                        samples: manifest.samples,
                                        sample_rate: 16000,
                                    })
                                })
                            };
                            let _ = reply.send(result);
                            return;
                        }
                    }
                }
                // 异常退出仍保留完整尾片；不发布未完成的 WAV。
                if failure.is_none() {
                    let _ = flush_slice(&dir, &mut manifest, &pending);
                }
            })
            .map_err(TingxuError::from)?;
        self.writers.insert(id.clone(), Writer { sender });
        Ok(id)
    }
    pub fn append(&self, id: &str, bytes: Vec<u8>) -> Result<(), TingxuError> {
        self.dir(id)?;
        if bytes.is_empty() || bytes.len() > 65536 || bytes.len() % 2 != 0 {
            return Err(TingxuError::buffer_overflow("录音数据块无效"));
        }
        self.writers
            .get(id)
            .ok_or_else(denied)?
            .sender
            .try_send(Message::Pcm(bytes))
            .map_err(|_| TingxuError::buffer_overflow("本机录音写入跟不上，请检查磁盘"))
    }
    pub fn checkpoint(&self, id: &str) -> Result<u64, TingxuError> {
        self.dir(id)?;
        let (tx, rx) = bounded(1);
        self.writers
            .get(id)
            .ok_or_else(denied)?
            .sender
            .send_timeout(Message::Flush(tx), std::time::Duration::from_secs(2))
            .map_err(|_| denied())?;
        rx.recv_timeout(std::time::Duration::from_secs(10))
            .map_err(|_| TingxuError::disk_io("本机录音保存超时"))?
    }
    pub fn finish(&mut self, id: &str) -> Result<RecordingMeta, TingxuError> {
        self.dir(id)?;
        let writer = self.writers.remove(id).ok_or_else(denied)?;
        let (tx, rx) = bounded(1);
        writer
            .sender
            .send_timeout(Message::Finish(tx), std::time::Duration::from_secs(2))
            .map_err(|_| denied())?;
        rx.recv_timeout(std::time::Duration::from_secs(10))
            .map_err(|_| TingxuError::disk_io("本机录音保存超时"))?
    }
    pub fn resolve(&self, id: &str) -> Result<PathBuf, TingxuError> {
        let dir = self.dir(id)?;
        Self::validate_recording_dir(&dir)
    }
    pub fn recording_dir(&self, id: &str) -> Result<PathBuf, TingxuError> {
        self.dir(id)
    }
    pub fn validate_recording_dir(dir: &Path) -> Result<PathBuf, TingxuError> {
        let file = dir.join("audio.wav");
        if !file.exists() {
            let m: Manifest = serde_json::from_reader(File::open(dir.join("manifest.json"))?)
                .map_err(|_| TingxuError::slice_corrupted("录音清单损坏"))?;
            build_wav(&dir, &m)?;
        }
        let path = file.canonicalize()?;
        if path.parent() != Some(dir) {
            return Err(denied());
        }
        let mut f = File::open(&path)?;
        let mut header = [0; 44];
        f.read_exact(&mut header)?;
        if &header[..4] != b"RIFF"
            || &header[8..12] != b"WAVE"
            || u32::from_le_bytes(header[40..44].try_into().map_err(|_| denied())?) as u64 + 44
                != f.metadata()?.len()
        {
            return Err(TingxuError::slice_corrupted("录音文件损坏"));
        }
        let manifest: Manifest = serde_json::from_reader(File::open(dir.join("manifest.json"))?)
            .map_err(|_| TingxuError::slice_corrupted("录音清单损坏"))?;
        let mut samples = 0;
        for (index, slice) in manifest.slices.iter().enumerate() {
            if slice.index != index as u64 || slice.start_sample != samples || slice.samples > 32000
            {
                return Err(TingxuError::slice_corrupted("录音清单顺序错误"));
            }
            let mut bytes = vec![0; slice.samples as usize * 2];
            f.read_exact(&mut bytes)?;
            if digest(&bytes) != slice.sha256 {
                return Err(TingxuError::slice_corrupted("录音文件损坏"));
            }
            samples += slice.samples;
        }
        if samples != manifest.samples || samples * 2 + 44 != f.metadata()?.len() {
            return Err(TingxuError::slice_corrupted("录音长度错误"));
        }
        Ok(path)
    }
    pub fn delete(&mut self, id: &str) -> Result<(), TingxuError> {
        let dir = self.dir(id)?;
        if self.writers.contains_key(id) {
            return Err(TingxuError::permission_denied("录音中不可删除"));
        }
        self.leases.retain(|_, path| !path.starts_with(&dir));
        fs::remove_dir_all(dir)?;
        Ok(())
    }
    pub fn register_lease(&mut self, id: &str, path: PathBuf) -> Result<String, TingxuError> {
        if path.parent() != Some(self.dir(id)?.as_path()) {
            return Err(denied());
        }
        let token = uuid::Uuid::new_v4().simple().to_string();
        self.leases.insert(token.clone(), path);
        Ok(token)
    }
    pub fn lease(&mut self, id: &str) -> Result<String, TingxuError> {
        let path = self.resolve(id)?;
        let token = uuid::Uuid::new_v4().simple().to_string();
        self.leases.insert(token.clone(), path);
        Ok(token)
    }
    pub fn release(&mut self, token: &str) {
        self.leases.remove(token);
    }
    pub fn leased_path(&self, token: &str) -> Result<PathBuf, TingxuError> {
        self.account_dir()?;
        self.leases.get(token).cloned().ok_or_else(denied)
    }
    pub fn storage_usage(&self) -> Result<StorageUsage, TingxuError> {
        let account = self.account_dir()?;
        if !account.exists() {
            return Ok(StorageUsage {
                total_bytes: 0,
                recording_count: 0,
            });
        }
        let mut total_bytes = 0u64;
        let mut recording_count = 0u32;
        let entries = fs::read_dir(&account)?;
        for entry in entries {
            let entry = entry?;
            let path = entry.path();
            if !path.is_dir() {
                continue;
            }
            let file_name = entry.file_name();
            let name_str = file_name.to_string_lossy();
            if !valid_id(&name_str) {
                continue;
            }
            recording_count += 1;
            total_bytes += dir_size(&path);
        }
        Ok(StorageUsage {
            total_bytes,
            recording_count,
        })
    }
    pub fn prune(
        &mut self,
        older_than_secs: Option<u64>,
        target_ids: Option<Vec<String>>,
    ) -> Result<PruneResult, TingxuError> {
        let account = self.account_dir()?;
        if !account.exists() {
            return Ok(PruneResult {
                freed_bytes: 0,
                deleted_count: 0,
                deleted_ids: Vec::new(),
            });
        }
        let current_time = now();
        let target_set: Option<std::collections::HashSet<String>> =
            target_ids.map(|ids| ids.into_iter().collect());
        let mut freed_bytes = 0u64;
        let mut deleted_count = 0u32;
        let mut deleted_ids = Vec::new();

        let entries = fs::read_dir(&account)?;
        for entry in entries {
            let entry = entry?;
            let path = entry.path();
            if !path.is_dir() {
                continue;
            }
            let file_name = entry.file_name();
            let id = file_name.to_string_lossy().to_string();
            if !valid_id(&id) {
                continue;
            }
            if self.writers.contains_key(&id) {
                continue;
            }
            if let Some(targets) = &target_set {
                if !targets.contains(&id) {
                    continue;
                }
            }
            if let Some(threshold) = older_than_secs {
                let mtime = get_recording_modified_secs(&path);
                if current_time >= mtime && current_time - mtime < threshold {
                    continue;
                }
            }
            let size = dir_size(&path);
            self.leases.retain(|_, p| !p.starts_with(&path));
            if fs::remove_dir_all(&path).is_ok() {
                freed_bytes += size;
                deleted_count += 1;
                deleted_ids.push(id);
            }
        }

        Ok(PruneResult {
            freed_bytes,
            deleted_count,
            deleted_ids,
        })
    }
}
fn write_manifest(dir: &Path, m: &Manifest) -> Result<(), TingxuError> {
    let bytes = serde_json::to_vec(m).map_err(|_| TingxuError::disk_io("录音清单写入失败"))?;
    atomic(dir, "manifest.json", &bytes)
}
fn atomic(dir: &Path, name: &str, bytes: &[u8]) -> Result<(), TingxuError> {
    let tmp = dir.join(format!("{name}.tmp"));
    let mut f = File::create(&tmp)?;
    f.write_all(bytes)?;
    f.sync_all()?;
    fs::rename(tmp, dir.join(name))?;
    Ok(())
}
fn flush_slice(dir: &Path, m: &mut Manifest, bytes: &[u8]) -> Result<(), TingxuError> {
    if bytes.is_empty() {
        return Ok(());
    }
    if m.samples * 2 + bytes.len() as u64 > u32::MAX as u64 - 36 {
        return Err(TingxuError::disk_io("录音超过 WAV 长度限制"));
    }
    let index = m.slices.len() as u64;
    atomic(dir, &format!("{index:06}.pcm"), bytes)?;
    m.slices.push(Slice {
        index,
        start_sample: m.samples,
        samples: bytes.len() as u64 / 2,
        sha256: digest(bytes),
    });
    m.samples += bytes.len() as u64 / 2;
    write_manifest(dir, m)
}
fn build_wav(dir: &Path, m: &Manifest) -> Result<(), TingxuError> {
    let target = dir.join("audio.wav.tmp");
    let mut f = File::create(&target)?;
    f.write_all(&[0; 44])?;
    let mut samples = 0;
    for (i, s) in m.slices.iter().enumerate() {
        if s.index != i as u64 || s.start_sample != samples || s.samples > 32768 {
            return Err(TingxuError::slice_corrupted("录音清单顺序错误"));
        }
        let path = dir.join(format!("{:06}.pcm", s.index)).canonicalize()?;
        if path.parent() != Some(dir) {
            return Err(denied());
        }
        if fs::metadata(&path)?.len() != s.samples * 2 {
            return Err(TingxuError::slice_corrupted("录音分片长度错误"));
        }
        let bytes = fs::read(path)?;
        if bytes.len() as u64 != s.samples * 2 || digest(&bytes) != s.sha256 {
            return Err(TingxuError::slice_corrupted("录音分片损坏"));
        }
        f.write_all(&bytes)?;
        samples += s.samples;
    }
    if samples != m.samples || samples * 2 > u32::MAX as u64 - 36 {
        return Err(TingxuError::slice_corrupted("录音长度错误"));
    }
    let len = (samples * 2) as u32;
    let mut h = Vec::with_capacity(44);
    h.extend(b"RIFF");
    h.extend((len + 36).to_le_bytes());
    h.extend(b"WAVEfmt ");
    h.extend(16u32.to_le_bytes());
    h.extend(1u16.to_le_bytes());
    h.extend(1u16.to_le_bytes());
    h.extend(16000u32.to_le_bytes());
    h.extend(32000u32.to_le_bytes());
    h.extend(2u16.to_le_bytes());
    h.extend(16u16.to_le_bytes());
    h.extend(b"data");
    h.extend(len.to_le_bytes());
    f.seek(SeekFrom::Start(0))?;
    f.write_all(&h)?;
    f.sync_all()?;
    fs::rename(target, dir.join("audio.wav"))?;
    Ok(())
}

fn dir_size(dir: &Path) -> u64 {
    let mut total = 0;
    if let Ok(entries) = fs::read_dir(dir) {
        for entry in entries.flatten() {
            if let Ok(meta) = entry.metadata() {
                if meta.is_file() {
                    total += meta.len();
                } else if meta.is_dir() {
                    total += dir_size(&entry.path());
                }
            }
        }
    }
    total
}

fn get_recording_modified_secs(dir: &Path) -> u64 {
    let check_targets = ["audio.wav", "manifest.json"];
    for target in &check_targets {
        let p = dir.join(target);
        if let Ok(meta) = p.metadata() {
            if let Ok(modified) = meta.modified() {
                if let Ok(d) = modified.duration_since(UNIX_EPOCH) {
                    return d.as_secs();
                }
            }
        }
    }
    if let Ok(meta) = dir.metadata() {
        if let Ok(modified) = meta.modified() {
            if let Ok(d) = modified.duration_since(UNIX_EPOCH) {
                return d.as_secs();
            }
        }
    }
    0
}
