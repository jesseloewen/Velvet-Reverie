module.exports = async (kernel) => {
  // Read port from .env file or use default
  let port = 4879
  
  // Check if .env exists and try to read FLASK_PORT
  const fs = require('fs')
  const path = require('path')
  const envPath = path.join(__dirname, '.env')
  
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8')
    const portMatch = envContent.match(/FLASK_PORT=(\d+)/)
    if (portMatch) {
      port = parseInt(portMatch[1])
    }
  }
  
  return {
    daemon: true,
    run: [
      {
        method: "shell.run",
        params: {
          venv: "venv",
          message: [
            "python app.py"
          ],
          on: [{
            event: "/VELVET REVERIE - Starting Server/",
            done: true
          }]
        }
      },
      {
        method: "local.set",
        params: {
          url: `http://localhost:${port}`
        }
      },
      {
        method: "notify",
        params: {
          html: `Velvet Reverie is running at <a href="http://localhost:${port}" target="_blank">http://localhost:${port}</a>`
        }
      }
    ]
  }
}
