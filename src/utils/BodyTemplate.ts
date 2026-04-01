// Update your TemplateConfig interface
export interface TemplateConfig {
  message?: string;
  version?: string;
  repoUrl?: string;
  docsUrl?: string;
  status?: "Active" | "Maintenance" | "Beta" | "Down";
  showButtons?: boolean;
  customStyles?: string;
  additionalContent?: string;
}

// Updated AppBodyTemplate function
export const AppBodyTemplate = (config: TemplateConfig = {}) => {
  const {
    message = "API Service is Running...",
    version = "1.0.0",
    status = "Active",
    showButtons = true,
    customStyles = "",
    additionalContent = "",
  } = config;

  // Status-specific defaults
  const statusConfig = {
    Maintenance: {
      color: "#ff9800",
      bgColor: "#fff8e6",
    },
    Down: {
      color: "#f44336",
      bgColor: "#ffebee",
    },
    Beta: {
      color: "#9c27b0",
      bgColor: "#f3e5f5",
    },
  };

  const statusStyle = statusConfig[status as keyof typeof statusConfig] || {};

  return `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Coreverapro API - ${status}</title>
        <style>
          body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background-color: #f5f5f5;
            margin: 0;
            padding: 20px;
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
            color: #333;
          }
          .container {
            background-color: white;
            border-radius: 10px;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
            padding: 30px;
            max-width: 600px;
            text-align: center;
            ${
              status !== "Active"
                ? `border-left: 5px solid ${statusStyle.color};`
                : ""
            }
            ${
              status !== "Active"
                ? `background-color: ${statusStyle.bgColor};`
                : ""
            }
          }
          h1 {
            color: ${status !== "Active" ? statusStyle.color : "#2c3e50"};
            margin-top: 0;
          }
          .logo {
            font-size: 2.5rem;
            margin-bottom: 20px;
          }
          .buttons {
            display: flex;
            gap: 15px;
            justify-content: center;
            margin-top: 30px;
          }
          .btn {
            padding: 12px 24px;
            border: none;
            border-radius: 5px;
            font-weight: bold;
            cursor: pointer;
            text-decoration: none;
            display: inline-block;
            transition: all 0.3s ease;
          }
          .btn-primary {
            background-color: #3498db;
            color: white;
          }
          .btn-secondary {
            background-color: #2ecc71;
            color: white;
          }
          .btn:hover {
            transform: translateY(-2px);
            box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);
          }
          .status {
            margin: 20px 0;
            padding: 15px;
            background-color: #f8f9fa;
            border-radius: 5px;
            font-family: monospace;
            ${
              status !== "Active"
                ? `background-color: ${statusStyle.color}20;`
                : ""
            }
            ${status !== "Active" ? `color: ${statusStyle.color};` : ""}
          }
          .maintenance-info {
            margin: 20px 0;
            padding: 15px;
            background-color: #ffffff80;
            border-radius: 5px;
          }
          ${customStyles}
        </style>
      </head>
      <body>
        <div class="container">
          <div class="logo">🩺 Coreverapro</div>
          <h1>${message}</h1>
          
          <div class="status">
            Status: <strong>${status}</strong> | Version: ${version}
          </div>
          
          ${
            status === "Active"
              ? "<p>Medical document analyzer</p>"
              : additionalContent
          }
          
       
        </div>
      </body>
      </html>
    `;
};
