{
  "targets": [
    {
      "target_name": "privacy_recorder",
      "cflags!": [ "-fno-exceptions" ],
      "cflags_cc!": [ "-fno-exceptions" ],
      "defines": [ "NAPI_DISABLE_CPP_EXCEPTIONS" ],
      "sources": [
        "src/globals.cpp",
        "src/dxgi_capture.cpp",
        "src/privacy_blur.cpp",
        "src/audio_capture.cpp",
        "src/encoder.cpp",
        "src/privacy_recorder.cpp",
        "src/log_buffer.cpp",
        "src/log_bridge.cpp",
        "src/netsurf_export.cpp",
        "src/video_ring_buffer.cpp",
        "src/video_buffer_bridge.cpp",
        "src/ring_buffer_encoder.cpp",
        "src/mp4_muxer.cpp",
        "src/network_buffer.cpp",
        "src/network_bridge.cpp"
      ],
      "include_dirs": [
        "<!@(node -p \"require('node-addon-api').include\")",
        "src"
      ],
      "conditions": [
        ["OS=='win'", {
          "libraries": [
            "-ld3d11.lib",
            "-ldxgi.lib",
            "-ld3dcompiler.lib",
            "-lmf.lib",
            "-lmfplat.lib",
            "-lmfuuid.lib",
            "-lmfreadwrite.lib"
          ],
          "msvs_settings": {
            "VCCLCompilerTool": {
              "ExceptionHandling": 1,
              "AdditionalOptions": [ "/O2", "/std:c++17" ]
            }
          }
        }]
      ],
      "dependencies": [
        "<!(node -p \"require('node-addon-api').gyp\")"
      ]
    }
  ]
}
