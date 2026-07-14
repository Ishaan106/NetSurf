/**
 * NETSURF FORMAT - Binary Export Format
 * 
 * File structure:
 * [HEADER 64B] [METADATA JSON] [LOG BLOCK GZIP] [VIDEO BLOCK]
 */

#pragma once

#include <cstdint>
#include <string>

namespace NetSurf {

// ============ VERSION ============
constexpr uint16_t FORMAT_VERSION = 0x0100;  // v1.0
constexpr char MAGIC[8] = {'N', 'E', 'T', 'S', 'U', 'R', 'F', '\0'};

// ============ HEADER (64 bytes) ============
#pragma pack(push, 1)
struct Header {
    char     magic[8];           // "NETSURF\0"
    uint16_t version;            // 0x0100 = v1.0
    uint16_t flags;              // Reserved
    uint64_t offset_metadata;    // Byte offset to metadata block
    uint64_t offset_logs;        // Byte offset to log block
    uint64_t offset_video;       // Byte offset to video block
    uint32_t size_metadata;      // Metadata size (uncompressed)
    uint32_t size_logs;          // Log block size (compressed)
    uint64_t size_video;         // Video block size
    uint32_t checksum;           // CRC32 of header[0:56]
    uint8_t  _reserved[8];       // Padding to 64 bytes
    
    void init();
    bool validate() const;
    uint32_t calculateChecksum() const;
};
#pragma pack(pop)

static_assert(sizeof(Header) == 64, "Header must be exactly 64 bytes");

// ============ FLAGS ============
constexpr uint16_t FLAG_HAS_AUDIO    = 0x0001;
constexpr uint16_t FLAG_HAS_BLUR     = 0x0002;
constexpr uint16_t FLAG_COMPRESSED   = 0x0004;

// ============ VIDEO PACKET HEADER ============
#pragma pack(push, 1)
struct VideoPacketHeader {
    uint32_t size;           // Packet data size
    int64_t  timestamp_100ns; // Timestamp in 100-nanosecond units
    uint8_t  flags;          // Keyframe, etc.
    uint8_t  _reserved[3];
};
#pragma pack(pop)

static_assert(sizeof(VideoPacketHeader) == 16, "VideoPacketHeader must be 16 bytes");

// ============ EXPORT OPTIONS ============
struct ExportOptions {
    int32_t start_ms;        // Trim start (milliseconds)
    int32_t end_ms;          // Trim end (milliseconds)
    std::wstring output_path; // Output file path
    std::wstring video_path;  // Source video file path (MP4)
    bool include_logs;       // Include log block
    bool include_video;      // Include video block
    bool compress_logs;      // GZIP compress logs
};

// ============ EXPORT RESULT ============
struct ExportResult {
    bool success;
    uint64_t file_size;
    uint32_t log_count;
    uint32_t video_packets;
    std::string error;
};

// ============ API ============
// Initialize export module
void Initialize();

// Export recording to .netsurf file (async - runs on worker thread)
ExportResult Export(const ExportOptions& options);

// Validate .netsurf file
bool ValidateFile(const std::wstring& path);

} // namespace NetSurf
