/**
 * VIDEO RING BUFFER - Flight Recorder Style Video Storage
 * 
 * Stores last N minutes of H.264 encoded NAL units in RAM.
 * Duration and FPS are runtime-configurable (1-5 min, 30/60 fps).
 * Uses Intel QuickSync encoder at 2500kbps.
 * 
 * MEMORY OPTIMIZED:
 * - 2500 kbps = 312.5 KB/sec = 37.5 MB for 2 minutes
 * - Uses pool-style buffer reuse (no per-frame alloc after warmup)
 * - Actual memory scales with configured duration
 */

#pragma once

#include <cstdint>
#include <atomic>
#include <mutex>
#include <vector>
#include <memory>

namespace VideoBuffer {

// ============ CONSTANTS ============
constexpr uint32_t DEFAULT_BUFFER_DURATION_SECONDS = 120;  // 2 minutes default
constexpr uint32_t DEFAULT_FPS = 60;
constexpr uint32_t DEFAULT_MAX_PACKETS = DEFAULT_BUFFER_DURATION_SECONDS * DEFAULT_FPS;  // 7200
constexpr uint32_t MAX_MAX_PACKETS = 300 * 60;  // 5 min @ 60fps = 18000 absolute cap
constexpr uint32_t BITRATE_KBPS = 2500;  // 2.5 Mbps
constexpr uint32_t MAX_PACKET_SIZE = 512 * 1024;  // 512KB max for keyframes

// ============ VIDEO PACKET (Pool-Style Buffer Reuse) ============
struct VideoPacket {
    int64_t  timestamp_100ns;    // Timestamp in 100-nanosecond units
    uint32_t size;               // Actual data size
    uint32_t capacity;           // Allocated buffer capacity (for reuse)
    uint8_t  flags;              // Bit 0: keyframe
    std::unique_ptr<uint8_t[]> data;  // H.264 NAL unit data
    
    VideoPacket() : timestamp_100ns(0), size(0), capacity(0), flags(0), data(nullptr) {}
    
    bool isKeyframe() const { return flags & 0x01; }
    void setKeyframe(bool kf) { 
        if (kf) flags |= 0x01;
        else flags &= ~0x01;
    }
    
    // Copy data — only reallocate when buffer is too small
    bool setData(const uint8_t* src, uint32_t dataSize) {
        if (!src || dataSize == 0 || dataSize > MAX_PACKET_SIZE) return false;
        if (dataSize > capacity) {
            // Need bigger buffer — allocate with headroom to reduce future reallocs
            uint32_t newCapacity = dataSize + (dataSize >> 2);  // +25% headroom
            if (newCapacity > MAX_PACKET_SIZE) newCapacity = MAX_PACKET_SIZE;
            data = std::make_unique<uint8_t[]>(newCapacity);
            capacity = newCapacity;
        }
        memcpy(data.get(), src, dataSize);
        size = dataSize;
        return true;
    }
    
    // Soft clear — keeps buffer allocated for reuse (hot path)
    void clear() {
        size = 0;
        timestamp_100ns = 0;
        flags = 0;
        // NOTE: data and capacity intentionally preserved for reuse
    }
    
    // Hard clear — actually frees memory (shutdown/dealloc path)
    void deallocate() {
        data.reset();
        size = 0;
        capacity = 0;
        timestamp_100ns = 0;
        flags = 0;
    }
};

// ============ RING BUFFER ============
class RingBuffer {
public:
    RingBuffer();
    ~RingBuffer();
    
    // Initialize buffer with default 60fps/2min
    bool init();
    
    // Initialize buffer with custom FPS and duration
    bool init(uint32_t fps, uint32_t durationSeconds);
    
    // Get configured max packets
    uint32_t getMaxPackets() const { return m_maxPackets; }
    
    // Push a new H.264 NAL (copies data, frees old packet's data)
    bool push(const uint8_t* data, uint32_t size, int64_t timestamp_100ns, bool isKeyframe);
    
    // Get packet by index (0 = oldest in buffer)
    const VideoPacket* getPacket(uint32_t index) const;
    
    // Get packet count in buffer
    uint32_t getCount() const;
    
    // Get buffer duration in milliseconds
    uint32_t getDurationMs() const;
    
    // Get timestamp range
    int64_t getStartTimestamp() const;
    int64_t getEndTimestamp() const;
    
    // Clear all packets (frees all data)
    void clear();
    
    // Recording control
    void startRecording();
    void stopRecording();
    bool isRecording() const;
    
    // Get actual memory used (sum of all packet data sizes)
    uint64_t getMemoryUsage() const;
    
    // Free all allocated memory
    void deallocate();
    
private:
    std::vector<VideoPacket> m_packets;
    uint32_t m_maxPackets{DEFAULT_MAX_PACKETS};  // Runtime-configurable capacity
    std::atomic<uint32_t> m_writeIndex{0};
    std::atomic<uint32_t> m_packetCount{0};
    std::atomic<bool> m_recording{false};
    std::atomic<uint64_t> m_memoryUsed{0};  // Track actual memory usage
    int64_t m_recordingStartTime{0};
    mutable std::mutex m_mutex;
    bool m_initialized{false};
};

// Global instance
extern RingBuffer g_videoBuffer;

// ============ API ============
void Initialize();
void InitializeWithConfig(uint32_t fps, uint32_t durationSeconds);
bool StartRecording();
void StopRecording();
bool IsRecording();
uint32_t GetPacketCount();
uint32_t GetDurationMs();
uint64_t GetMemoryUsage();

// Push H.264 NAL from encoder (called on encoder thread)
bool PushFrame(const uint8_t* data, uint32_t size, int64_t timestamp_100ns, bool isKeyframe);

} // namespace VideoBuffer
