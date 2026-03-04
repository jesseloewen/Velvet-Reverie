module.exports = {
  version: "1.0",
  title: "Velvet Reverie - AI Media Generation",
  description: "Flask web UI for AI image, video, and audio generation via ComfyUI, Ollama, and Gradio TTS",
  icon: "icon.png",
  menu: async (kernel, info) => {
    let installed = info.exists("venv") || info.exists("requirements.txt")
    let running = {
      start: info.running("start.js"),
      reset: info.running("reset.js")
    }

    if (installed) {
      if (running.start) {
        return [{
          default: true,
          icon: 'fa-solid fa-terminal',
          text: "Server Running",
          href: "start.js",
        }, {
          icon: "fa-solid fa-globe",
          text: "Open Web UI",
          href: "{{local.url}}",
        }]
      } else {
        return [{
          default: true,
          icon: "fa-solid fa-power-off",
          text: "Start Server",
          href: "start.js",
        }, {
          icon: "fa-regular fa-circle-xmark",
          text: "Reset",
          href: "reset.js",
          confirm: "Are you sure you wish to reset? This will delete outputs and cache."
        }]
      }
    } else {
      return [{
        default: true,
        icon: "fa-solid fa-download",
        text: "Setup Required",
        href: "https://github.com/yourusername/Velvet-Reverie",
      }]
    }
  }
}
