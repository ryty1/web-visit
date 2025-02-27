export default {
  async scheduled(event, env, ctx) {
    const user = env.USER_SERV00;
    const kvKey = `status:${user}`;
    const historyKey = `history:${user}`;
    const targetUrl = `https://${user}.serv00.net/login`;
    console.log(`[${new Date().toISOString()}] 定时任务触发，检查状态：${targetUrl}`);
    await checkLoginStatus(targetUrl, kvKey, historyKey, env);
  },
  async fetch(request, env) {
    if (request.url.includes('/history')) {
      return getHistory(env); 
    } else {
      return new Response(htmlPage(), {
        headers: { "Content-Type": "text/html" },
      });
    }
  }
};
const statusMessages = {
  200: "访问成功",
  301: "账号己封",
  302: "访问成功",
  400: "请求失败",
  401: "请求失败",
  403: "账号已封禁",
  404: "未安装账号服务",
  500: "请求失败",
  502: "请求失败",
  503: "请求失败",
  504: "请求失败"
};
async function checkLoginStatus(targetUrl, kvKey, historyKey, env) {
  try {
    const response = await fetch(targetUrl);
    const statusCode = response.status;
    const statusMessage = statusMessages[statusCode] || `未知状态 (${statusCode})`;
    const previousStatus = await env.LOGIN_STATUS.get(kvKey);
    console.log(`[${new Date().toISOString()}] ${targetUrl} - 状态码: ${statusCode} (${statusMessage}) (之前: ${previousStatus || '无'})`);
    await updateHistory(historyKey, statusCode, env);
    if (statusCode !== 200) {
      await sendTelegramAlert(targetUrl, statusCode, statusMessage, env);
    }
    await env.LOGIN_STATUS.put(kvKey, String(statusCode));  
    return new Response(`检测完成: ${targetUrl} - 状态码: ${statusCode} - ${statusMessage}`, { status: statusCode });
  } catch (error) {
    console.error("访问失败:", error);
    await sendTelegramAlert(targetUrl, "请求失败", "无法访问", env);
    return new Response("请求失败", { status: 500 });
  }
}
async function updateHistory(historyKey, statusCode, env) {
  const maxHistory = 10;
  let history = await env.LOGIN_STATUS.get(historyKey);
  history = history ? JSON.parse(history) : [];
  history.push({ time: new Date().toISOString(), status: statusCode });
  if (history.length > maxHistory) history.shift();
  await env.LOGIN_STATUS.put(historyKey, JSON.stringify(history));
}
async function getHistory(env) {
  const user = env.USER_SERV00;
  const historyKey = `history:${user}`;
  let history = await env.LOGIN_STATUS.get(historyKey);
  history = history ? JSON.parse(history) : [];
  return new Response(JSON.stringify(history), {
    headers: { "Content-Type": "application/json" },
  });
}
async function sendTelegramAlert(targetUrl, statusCode, statusMessage, env) {
  const botToken = env.TG_BOT_TOKEN;
  const chatId = env.TG_CHAT_ID;
  const message = `⚠️ 状态变化\nURL: ${targetUrl}\n新状态: ${statusCode} - ${statusMessage}`;
  const tgUrl = `https://api.telegram.org/bot${botToken}/sendMessage`;
  const payload = {
    chat_id: chatId,
    text: message,
  };
  try {
    await fetch(tgUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch (error) {
    console.error("Telegram 发送失败:", error);
  }
}
function htmlPage() {
  return `
    <!DOCTYPE html>
    <html lang="zh-CN">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>状态记录</title>
      <style>
        body {
          font-family: Arial, sans-serif;
          background-color: #f4f4f4;
          margin: 0;
          padding: 20px;
        }
        h1 {
          text-align: center;
        }
        .container {
          max-width: 800px;
          margin: 0 auto;
          padding: 20px;
          background-color: #fff;
          box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
        }
        table {
          width: 100%;
          border-collapse: collapse;
          margin-top: 20px;
        }
        table, th, td {
          border: 1px solid #ddd;
        }
        th, td {
          padding: 10px;
          text-align: left;
        }
        th {
          background-color: #f2f2f2;
        }
        .loading {
          text-align: center;
          font-size: 18px;
          color: #888;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>网页访问历史记录</h1>
        <div id="loading" class="loading">加载中...</div>
        <table id="historyTable">
          <thead>
            <tr>
              <th>时间</th>
              <th>状态</th>
            </tr>
          </thead>
          <tbody></tbody>
        </table>
      </div>
      <script>
        async function fetchHistory() {
          const response = await fetch("/history");
          if (response.ok) {
            const history = await response.json();
            const tableBody = document.querySelector("#historyTable tbody");
            tableBody.innerHTML = "";
            if (history.length === 0) {
              tableBody.innerHTML = "<tr><td colspan='2'>没有记录</td></tr>";
            } else {
              history.reverse();
              history.forEach(item => {
                const row = document.createElement("tr");
                row.innerHTML = "<td>" + new Date(item.time).toLocaleString() + "</td><td>" + getStatusMessage(item.status) + "</td>";
                tableBody.appendChild(row);
              });
            }
            document.getElementById("loading").style.display = "none";
          } else {
            alert("加载历史记录失败");
          }
        }
        function getStatusMessage(statusCode) {
          const statusMessages = {
            200: "访问成功",
            400: "访问失败",
            401: "访问失败",
            403: "账号已封禁",
            404: "未安装账号服务",
            500: "访问失败",
            502: "访问失败",
            503: "访问失败",
            504: "访问失败"
          };
          return statusMessages[statusCode];
        }

        window.onload = fetchHistory;
      </script>
    </body>
    </html>
  `;
}
