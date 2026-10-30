use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone, Copy, PartialEq, Eq, Hash)]
pub enum TrackType {
    Mic,
    System,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
pub struct AudioDevice {
    pub id: String,
    pub name: String,
    pub track: TrackType,
    pub is_default: bool,
}

pub struct AudioDeviceManager {
    devices: Vec<AudioDevice>,
}

impl Default for AudioDeviceManager {
    fn default() -> Self {
        Self::new()
    }
}

impl AudioDeviceManager {
    pub fn new() -> Self {
        Self {
            devices: Vec::new(),
        }
    }

    pub fn register_device(&mut self, device: AudioDevice) {
        self.devices.retain(|d| d.id != device.id);
        self.devices.push(device);
    }

    pub fn list_devices(&self) -> &[AudioDevice] {
        &self.devices
    }

    pub fn get_active_tracks(&self) -> Vec<TrackType> {
        let mut tracks = Vec::new();
        for dev in &self.devices {
            if !tracks.contains(&dev.track) {
                tracks.push(dev.track);
            }
        }
        tracks
    }

    pub fn handle_device_hotplug(&mut self, removed_id: &str, new_device: Option<AudioDevice>) {
        self.devices.retain(|d| d.id != removed_id);
        if let Some(dev) = new_device {
            self.register_device(dev);
        }
    }
}
