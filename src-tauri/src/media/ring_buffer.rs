use crate::error::TingxuError;

/// 音频无锁高频环形缓冲区
/// 特性：初始化时一次性预分配内存，回调与读取循环中绝对零堆分配（对齐 AGENTS.md 5.1）
pub struct AudioRingBuffer {
    buffer: Vec<i16>,
    capacity: usize,
    head: usize, // 写入指针
    tail: usize, // 读取指针
    count: usize, // 当前可读样本数
}

impl AudioRingBuffer {
    pub fn new(capacity: usize) -> Self {
        Self {
            buffer: vec![0i16; capacity],
            capacity,
            head: 0,
            tail: 0,
            count: 0,
        }
    }

    #[inline]
    pub fn capacity(&self) -> usize {
        self.capacity
    }

    #[inline]
    pub fn available_read(&self) -> usize {
        self.count
    }

    #[inline]
    pub fn available_write(&self) -> usize {
        self.capacity - self.count
    }

    /// 写入音频切片样本（高频回调中调用，严禁发生内存重分配）
    pub fn push_slice(&mut self, samples: &[i16]) -> Result<usize, TingxuError> {
        let to_write = samples.len();
        if to_write > self.available_write() {
            return Err(TingxuError::buffer_overflow(format!(
                "环形缓冲溢出：尝试写入 {} 样本，仅剩可用空间 {}",
                to_write,
                self.available_write()
            )));
        }

        for &sample in samples {
            self.buffer[self.head] = sample;
            self.head = (self.head + 1) % self.capacity;
        }
        self.count += to_write;

        Ok(to_write)
    }

    /// 读取音频样本进入目标缓冲
    pub fn pop_slice(&mut self, output: &mut [i16]) -> usize {
        let to_read = output.len().min(self.count);

        for out in output.iter_mut().take(to_read) {
            *out = self.buffer[self.tail];
            self.tail = (self.tail + 1) % self.capacity;
        }
        self.count -= to_read;

        to_read
    }

    pub fn clear(&mut self) {
        self.head = 0;
        self.tail = 0;
        self.count = 0;
    }
}
