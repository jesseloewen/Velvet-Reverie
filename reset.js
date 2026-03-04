module.exports = {
  run: [
    {
      method: "shell.run",
      params: {
        message: [
          "{{os.platform() === 'win32' ? 'rmdir /s /q outputs cache' : 'rm -rf outputs cache'}}"
        ]
      }
    },
    {
      method: "notify",
      params: {
        html: "Reset complete. Outputs and cache have been cleared."
      }
    }
  ]
}
