export default {
  // 定义 Cron 触发任务
  async scheduled(event, env, ctx) {
    const user = env.USER_SERV00;
    const kvKey = `status:${user}`;
    const historyKey = `history:${user}`;
    const targetUrl = `https://${user}.serv00.net/online`;

    console.log(`[${new Date().toISOString()}] 定时任务触发，检查状态：${targetUrl}`);

    await checkLoginStatus(targetUrl, kvKey, historyKey, env);
  },

  // 处理 HTTP 请求
  async fetch(request, env) {
    if (request.url.includes('/history')) {
      return getHistory(env);
    } else {
      return new Response(htmlPage(), { headers: { "Content-Type": "text/html" } });
    }
  }
};

// 状态码映射
const statusMessages = {
  200: "访问成功",
  301: "账号未注册",
  302: "访问成功",
  400: "请求失败",
  401: "请求失败",
  403: "账号已封禁",
  404: "未安装账号服务",
  500: "请求失败",
  502: "请求失败",
  503: "请求失败",
  504: "请求超时"
};

// 检查网站状态
async function checkLoginStatus(targetUrl, kvKey, historyKey, env) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);

  let statusCode, statusMessage;

  try {
    const response = await fetch(targetUrl, { signal: controller.signal });
    clearTimeout(timeoutId);

    statusCode = response.status;
    statusMessage = statusMessages[statusCode] || `未知状态 (${statusCode})`;

  } catch (error) {
    clearTimeout(timeoutId);

    statusCode = error.name === 'AbortError' ? 504 : 500;
    statusMessage = statusCode === 504 ? "访问超时" : "请求失败";

    console.error(`[${new Date().toISOString()}] ${targetUrl} - ${statusMessage}`);
  }

  console.log(`[${new Date().toISOString()}] ${targetUrl} - 状态码: ${statusCode} (${statusMessage})`);

  // **无论成功还是失败，都存入 KV**
  await updateHistory(historyKey, statusCode, env);
  await env.LOGIN_STATUS.put(kvKey, String(statusCode));

  // **如果失败，发送 Telegram 通知**
  if (![200, 302].includes(statusCode)) {
    await sendTelegramAlert(env.USER_SERV00, targetUrl, statusCode, statusMessage, env);
  }

  return new Response(`检测完成: ${targetUrl} - 状态码: ${statusCode} - ${statusMessage}`, { status: statusCode });
}

// 记录历史状态
async function updateHistory(historyKey, statusCode, env) {
  const maxHistory = 20;  // 增加历史记录保存数量
  let history = await env.LOGIN_STATUS.get(historyKey);
  history = history ? JSON.parse(history) : [];

  history.push({ time: new Date().toISOString(), status: statusCode });
  if (history.length > maxHistory) history.shift();

  console.log(`更新历史记录: ${JSON.stringify(history)}`);  // ✅ 调试日志
  await env.LOGIN_STATUS.put(historyKey, JSON.stringify(history));
}

// 获取历史记录
async function getHistory(env) {
  const user = env.USER_SERV00;
  const historyKey = `history:${user}`;

  let history = await env.LOGIN_STATUS.get(historyKey);
  history = history ? JSON.parse(history) : [];

  return new Response(JSON.stringify(history), { headers: { "Content-Type": "application/json" } });
}

// 发送 Telegram 通知
async function sendTelegramAlert(user, targetUrl, statusCode, statusMessage, env) {
  const botToken = env.TG_BOT_TOKEN;
  const chatId = env.TG_CHAT_ID;
  const timestamp = new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" });

  const message = `🔴 CF访问失败通知：
——————————————
👤 账号: ${user}
📶 状态: ${statusCode}
📝 详情: ${statusMessage}
——————————————
🕒 时间: ${timestamp}`;

  const inlineKeyboard = {
    inline_keyboard: [[{ text: "手动前往", url: targetUrl }]],
  };

  const tgUrl = `https://api.telegram.org/bot${botToken}/sendMessage`;
  const payload = { chat_id: chatId, text: message, reply_markup: JSON.stringify(inlineKeyboard) };

  try {
    const response = await fetch(tgUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      console.error("Telegram API 请求失败:", await response.text());
    }
  } catch (error) {
    console.error("Telegram 发送失败:", error);
  }
}

// HTML 页面
function htmlPage() {
  return `
    <!DOCTYPE html>
    <html lang="zh-CN">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>状态记录</title>
      <style>
        body { font-family: Arial, sans-serif; background-color: #f4f4f4; margin: 0; padding: 20px; }
        h1 { text-align: center; }
        .container { max-width: 800px; margin: 0 auto; padding: 20px; background-color: #fff; box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1); }
        table { width: 100%; border-collapse: collapse; margin-top: 20px; }
        table, th, td { border: 1px solid #ddd; }
        th, td { padding: 10px; text-align: left; }
        th { background-color: #f2f2f2; }
        .loading { text-align: center; font-size: 18px; color: #888; }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>网页访问历史记录</h1>
        <div id="loading" class="loading">加载中...</div>
        <table id="historyTable">
          <thead><tr><th>时间</th><th>状态</th></tr></thead>
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
              history.reverse().forEach(item => {
                const row = document.createElement("tr");
                const statusMessage = getStatusMessage(item.status) || \`未知状态 (\${item.status})\`;
                row.innerHTML = \`<td>\${new Date(item.time).toLocaleString()}</td><td>\${statusMessage}</td>\`;
                tableBody.appendChild(row);
              });
            }
            document.getElementById("loading").style.display = "none";
          } else {
            alert("加载历史记录失败");
          }
        }

        function getStatusMessage(statusCode) {
          const statusMessages = ${JSON.stringify(statusMessages)};
          return statusMessages[statusCode] || \`未知状态 (\${statusCode})\`;
        }

        window.onload = fetchHistory;
      </script>
    </body>
    </html>
  `;
}
