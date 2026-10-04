Minecraft AI Groq Bridge

一個輕量、高擴充性且極速回應的 Minecraft AI 控制介面。本專案透過 Mineflayer 將 Minecraft 遊戲內部狀態轉接至 Groq API (LLaMA 3 / 3.3) 與 WebSocket 伺服器，實現毫秒級的 AI 角色自主決策與遊戲互動。

特色

Groq 推理：原生整合 Groq Cloud API，利用超高速 LLaMA 3 模型對遊戲狀況做出即時反應。

雙向 WebSocket API：可作為獨立 Bridge，讓 Python、LangChain 或其他外部 AI 框架透過 JSON 進行控制。

自動尋路能力：整合 mineflayer-pathfinder，直接支援 A* 自動尋路 (move_to)。

結構化 JSON 輸出：嚴格讓 LLM 輸出行動 JSON 指令，確保遊戲動作發射精準無誤。

快速開始

1. 安裝環境需求

Node.js (v18 或以上)

Java 版 Minecraft 伺服器 (Local 或 Remote)

Groq Cloud API Key (免費註冊取得)

2. 安裝依賴套件

npm init -y
npm install mineflayer ws mineflayer-pathfinder minecraft-data groq-sdk dotenv


3. 設定環境變數 (.env)

在專案根目錄建立 .env 檔案：

# Groq API 設定
GROQ_API_KEY=your_groq_api_key_here
GROQ_MODEL=llama-3.3-70b-versatile

# Minecraft 伺服器設定
MC_HOST=localhost
MC_PORT=25565
MC_USER=GroqAIBot

# WebSocket 設定
WS_PORT=8080


4. 啟動機器人

node index.js

 運作邏輯說明

當玩家在遊戲聊天室發言（例如：「GroqAIBot，過來 100 64 -200 這裡」）。

index.js 擷取事件並將情境（Context）傳送給 Groq LLM。

Groq 於 100~300ms 內回傳 JSON 指令（例如 {"action": "move_to", "x": 100, "y": 64, "z": -200}）。

Bot 自動執行 Pathfinding 移動或聊天回應
