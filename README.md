## 1.	部署 Workers
   复制worker.js内容，粘贴到你新建的worker项目代码后部署，不多讲。

## 2.   在 Cloudflare KV 里添加 LOGIN_STATUS 命名空间
   项目绑定kv空间
| 项目          | 值                  |
|-------------|------------------|
| Binding Name | LOGIN_STATUS    |
| Namespace   | LOGIN_STATUS |

## 3.	在 Worker 的 Variables 里设置环境变量

| 变量名          | 说明                 |
|---------------|--------------------|
| USER_SERV00   | 用户名               |
| TG_BOT_TOKEN  | Telegram Bot Token  |
| TG_CHAT_ID    | Telegram Chat ID    |

   •	    网页访问失败才会TG通知。

## 4.	设置 触发事件-Cloudflare Cron Triggers
   •	Cron 表达式：*/5 * * * *（每 5 分钟执行）自行设置数值
   •	Cloudflare 会定期运行 Worker，自动检测状态。

## 5.	查看记录
   •	    访问 Worker 项目的 域名查看，如：
    
    https://login.serok.workers.dev