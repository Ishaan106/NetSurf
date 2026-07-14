/**
 * VIDEO RING BUFFER - Implementation
 * 
 * Lock-free circular buffer for H.264 NAL units.
 * Runtime-configurable capacity (FPS × duration).
 * Uses pool-style buffer reuse for zero steady-state allocations.
 */

#include "video_ring_buffer.h"
#include <cstring>
#include <chrono>
#include <iostream>

namespace VideoBuffer {

// Global instance
RingBuffer g_videoBuffer;

// ============ RING BUFFER IMPLEMENTATION ============

RingBuffer::RingBuffer() = default;
RingBuffer::~RingBuffer() = default;

bool RingBuffer::init() {
    return init(DEFAULT_FPS, DEFAULT_BUFFER_DURATION_SECONDS);
}

bool RingBuffer::init(uint32_t fps, uint32_t durationSeconds) {
    if (m_initialized) {
        // Already initialized — if config changed, deallocate and reinit
        if (fps * durationSeconds != m_maxPackets) {
            deallocate();
        } else {
            return true;
        }
    }
    
    try {
        // Calculate capacity: fps × duration, capped at absolute max
        m_maxPackets = fps * durationSeconds;
        if (m_maxPackets > MAX_MAX_PACKETS) m_maxPackets = MAX_MAX_PACKETS;
        if (m_maxPackets < 30) m_maxPackets = 30;  // Minimum 1 second @ 30fps
        
        // Only allocate packet array (NOT the data inside)
        // Each packet starts with nullptr data — allocated on first push
        m_packets.resize(m_maxPackets);
        m_memoryUsed.store(0);
        m_initialized = true;
        
        std::cout << "[VideoBuffer] Initialized with " << m_maxPackets 
                  << " packet slots (" << fps << "fps × " << durationSeconds << "s)" << std::endl;
        
        clear();
        return true;
    } catch (...) {
        return false;
    }
}

bool RingBuffer::push(const uint8_t* data, uint32_t size, int64_t timestamp_100ns, bool isKeyframe) {
    if (!m_initialized || !m_recording.load() || !data || size == 0) {
        return false;
    }
    
    // Clamp size to max
    if (size > MAX_PACKET_SIZE) {
        std::cerr << "[VideoBuffer] Packet too large: " << size << " bytes (max " << MAX_PACKET_SIZE << ")" << std::endl;
        size = MAX_PACKET_SIZE;
    }
    
    // Get current write position (atomic)
    uint32_t writePos = m_writeIndex.load() % m_maxPackets;
    
    // Get old packet to track memory freed
    VideoPacket& packet = m_packets[writePos];
    uint32_t oldSize = packet.size;
    
    // Soft clear old data (keeps buffer allocated for reuse)
    packet.clear();
    
    // Store new packet data (reuses buffer when possible)
    packet.timestamp_100ns = timestamp_100ns;
    packet.setKeyframe(isKeyframe);
    if (!packet.setData(data, size)) {
        return false;
    }
    
    // Update memory tracking
    m_memoryUsed.fetch_sub(oldSize);
    m_memoryUsed.fetch_add(size);
    
    // Advance write index
    m_writeIndex.fetch_add(1);
    
    // Update count (capped at m_maxPackets)
    uint32_t currentCount = m_packetCount.load();
    if (currentCount < m_maxPackets) {
        m_packetCount.fetch_add(1);
    }
    
    return true;
}

const VideoPacket* RingBuffer::getPacket(uint32_t index) const {
    if (!m_initialized || index >= m_packetCount.load()) {
        return nullptr;
    }
    
    // Calculate actual position in circular buffer
    uint32_t totalWritten = m_writeIndex.load();
    uint32_t count = m_packetCount.load();
    
    // Oldest packet position
    uint32_t oldestPos = (totalWritten >= count) ? (totalWritten - count) % m_maxPackets : 0;
    uint32_t actualPos = (oldestPos + index) % m_maxPackets;
    
    return &m_packets[actualPos];
}

uint32_t RingBuffer::getCount() const {
    return m_packetCount.load();
}

uint32_t RingBuffer::getDurationMs() const {
    if (m_packetCount.load() < 2) return 0;
    
    const VideoPacket* oldest = getPacket(0);
    const VideoPacket* newest = getPacket(m_packetCount.load() - 1);
    
    if (!oldest || !newest) return 0;
    
    // Convert 100ns units to milliseconds
    int64_t durationNs = (newest->timestamp_100ns - oldest->timestamp_100ns) * 100;
    return static_cast<uint32_t>(durationNs / 1000000);
}

int64_t RingBuffer::getStartTimestamp() const {
    const VideoPacket* oldest = getPacket(0);
    return oldest ? oldest->timestamp_100ns : 0;
}

int64_t RingBuffer::getEndTimestamp() const {
    uint32_t count = m_packetCount.load();
    if (count == 0) return 0;
    const VideoPacket* newest = getPacket(count - 1);
    return newest ? newest->timestamp_100ns : 0;
}

void RingBuffer::clear() {
    std::lock_guard<std::mutex> lock(m_mutex);
    
    // Soft clear — keeps buffers allocated for reuse
    for (auto& packet : m_packets) {
        packet.clear();
    }
    
    m_writeIndex.store(0);
    m_packetCount.store(0);
    m_memoryUsed.store(0);
    m_recordingStartTime = 0;
}

void RingBuffer::startRecording() {
    if (!m_initialized) {
        init();
    }
    clear();
    
    // Get current time as recording start
    auto now = std::chrono::steady_clock::now();
    m_recordingStartTime = std::chrono::duration_cast<std::chrono::nanoseconds>(
        now.time_since_epoch()
    ).count() / 100;  // Convert to 100ns units
    
    m_recording.store(true);
    std::cout << "[VideoBuffer] Recording started" << std::endl;
}

void RingBuffer::stopRecording() {
    m_recording.store(false);
    std::cout << "[VideoBuffer] Recording stopped. Packets: " << m_packetCount.load()
              << ", Memory: " << (m_memoryUsed.load() / (1024*1024)) << " MB" << std::endl;
}

bool RingBuffer::isRecording() const {
    return m_recording.load();
}

uint64_t RingBuffer::getMemoryUsage() const {
    if (!m_initialized) return 0;
    return m_memoryUsed.load();
}

void RingBuffer::deallocate() {
    std::lock_guard<std::mutex> lock(m_mutex);
    m_recording.store(false);
    m_writeIndex.store(0);
    m_packetCount.store(0);
    m_memoryUsed.store(0);
    m_recordingStartTime = 0;
    m_initialized = false;
    
    // Hard clear — actually free each packet's buffer
    for (auto& packet : m_packets) {
        packet.deallocate();
    }
    
    // Use swap idiom to actually free vector memory
    std::vector<VideoPacket>().swap(m_packets);
    
    std::cout << "[VideoBuffer] Deallocated" << std::endl;
}

// ============ API FUNCTIONS ============

void Initialize() {
    g_videoBuffer.init();
}

void InitializeWithConfig(uint32_t fps, uint32_t durationSeconds) {
    g_videoBuffer.init(fps, durationSeconds);
}

bool StartRecording() {
    g_videoBuffer.startRecording();
    return true;
}

void StopRecording() {
    g_videoBuffer.stopRecording();
}

bool IsRecording() {
    return g_videoBuffer.isRecording();
}

uint32_t GetPacketCount() {
    return g_videoBuffer.getCount();
}

uint32_t GetDurationMs() {
    return g_videoBuffer.getDurationMs();
}

uint64_t GetMemoryUsage() {
    return g_videoBuffer.getMemoryUsage();
}

bool PushFrame(const uint8_t* data, uint32_t size, int64_t timestamp_100ns, bool isKeyframe) {
    return g_videoBuffer.push(data, size, timestamp_100ns, isKeyframe);
}

} // namespace VideoBuffer
