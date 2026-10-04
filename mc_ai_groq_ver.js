require('dotenv').config();
const mineflayer = require('mineflayer');
const WebSocket = require('ws');
const pathfinder = require('mineflayer-pathfinder').pathfinder;
const { Movements, goals } = require('mineflayer-pathfinder');
const Groq = require('groq-sdk');

// ===== 設定區塊 =====
const MC_CONFIG = {
  host: process.env.MC_HOST || 'localhost',
  port: parseInt(process.env.MC_PORT || '25565'),
  username: process.env.MC_USER || 'GroqAIBot',
  version: process.env.MC_VERSION || false
};

const WS_PORT = parseInt(process.env.WS_PORT || '8080');
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_MODEL = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';

// 初始化 Groq SDK
const groq = GROQ_API_KEY ? new Groq({ apiKey: GROQ_API_KEY }) : null;

if (groq) {
  console.log(`[Groq AI] 成功載入 Groq SDK，使用模型: ${GROQ_MODEL}`);
} else {
  console.log('[Groq AI] 未設定 GROQ_API_KEY，將僅透過 WebSocket 接受外部指令');
}

// ===== 初始化 Bot =====
console.log(`[MC Bot] 連接至 ${MC_CONFIG.host}:${MC_CONFIG.port} ...`);
const bot = mineflayer.createBot(MC_CONFIG);
bot.loadPlugin(pathfinder);

// ===== 初始化 WebSocket Server =====
const wss = new WebSocket.Server({ port: WS_PORT });
console.log(`[WebSocket] 伺服器運行於 ws://localhost:${WS_PORT}`);

let activeClients = new Set();

wss.on('connection', (ws) => {
  console.log('[WebSocket] 外部控制器已連線');
  activeClients.add(ws);

  sendToClient(ws, {
    type: 'init',
    status: 'connected',
    bot: {
      username: bot.username,
      health: bot.health,
      food: bot.food,
      position: bot.entity ? bot.entity.position : null
    }
  });

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message.toString());
      handleAICommand(data, ws);
    } catch (err) {
      console.error('[WebSocket] 格式錯誤:', err.message);
      ws.send(JSON.stringify({ type: 'error', message: 'Invalid JSON format' }));
    }
  });

  ws.on('close', () => {
    console.log('[WebSocket] 控制器已斷線');
    activeClients.delete(ws);
  });
});

function broadcast(data) {
  const payload = JSON.stringify(data);
  activeClients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  });
}

function sendToClient(ws, data) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data));
  }
}

// ===== 呼叫 Groq API 生成決策 =====
async function queryGroqAI(promptText) {
  if (!groq) return null;

  const systemPrompt = `
你是一個 Minecraft 遊戲中的 AI 玩家。請根據玩家的訊息或遊戲狀況，選擇最合適的行動。
你的回應必須【嚴格為單一 JSON 物件】，絕不能包含額外文字或 Markdown 標記。

可用的行動 JSON 格式：
1. 聊天回應: {"action": "chat", "text": "回應內容"}
2. 自動尋路移動: {"action": "move_to", "x": 100, "y": 64, "z": -200}
3. 原地跳躍: {"action": "jump"}
4. 查詢狀態: {"action": "get_state"}

當玩家要求你移動到某座標時，請提取出 x, y, z 數字並使用 move_to 動作。
  `.trim();

  try {
    const chatCompletion = await groq.chat.completions.create({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: promptText }
      ],
      model: GROQ_MODEL,
      temperature: 0.2,
      response_format: { type: 'json_object' }
    });

    const content = chatCompletion.choices[0]?.message?.content;
    return JSON.parse(content);
  } catch (err) {
    console.error('[Groq Error]:', err.message);
    return null;
  }
}

// ===== Bot 事件綁定 =====
bot.on('spawn', () => {
  console.log('[MC Bot] 成功進入伺服器！');
  broadcast({ type: 'spawn', username: bot.username });
});

bot.on('chat', async (username, message) => {
  if (username === bot.username) return;

  console.log(`[Chat] <${username}> ${message}`);
  broadcast({ type: 'chat', username, message });

  // 若有設定 Groq API Key，自動由 Groq LLM 生成回應與動作
  if (groq) {
    console.log('[Groq AI] 正在思考回應與動作...');
    const command = await queryGroqAI(`玩家 ${username} 說: "${message}"`);
    if (command) {
      console.log('[Groq AI] 決定執行指令:', command);
      handleAICommand(command);
    }
  }
});

bot.on('health', () => {
  broadcast({
    type: 'status_update',
    health: bot.health,
    food: bot.food
  });
});

bot.on('error', (err) => {
  console.error('[MC Bot] 錯誤:', err);
  broadcast({ type: 'error', message: err.message });
});

// ===== 執行 AI 指令 =====
function handleAICommand(cmd, ws = null) {
  console.log(`[Executing Action]: ${cmd.action}`);

  switch (cmd.action) {
    case 'chat':
      if (cmd.text) {
        bot.chat(cmd.text);
        if (ws) sendToClient(ws, { type: 'response', action: 'chat', status: 'success' });
      }
      break;

    case 'move_to':
      if (typeof cmd.x === 'number' && typeof cmd.y === 'number' && typeof cmd.z === 'number') {
        const mcData = require('minecraft-data')(bot.version);
        const defaultMove = new Movements(bot, mcData);
        bot.pathfinder.setMovements(defaultMove);

        const goal = new goals.GoalBlock(cmd.x, cmd.y, cmd.z);
        bot.pathfinder.setGoal(goal);

        bot.chat(`正在前往座標 (${cmd.x}, ${cmd.y}, ${cmd.z})...`);
        if (ws) sendToClient(ws, { type: 'response', action: 'move_to', status: 'pathfinding_started' });
      } else {
        if (ws) sendToClient(ws, { type: 'response', action: 'move_to', status: 'error', message: 'Missing x, y, z' });
      }
      break;

    case 'jump':
      bot.setControlState('jump', true);
      setTimeout(() => bot.setControlState('jump', false), 400);
      if (ws) sendToClient(ws, { type: 'response', action: 'jump', status: 'success' });
      break;

    case 'get_state':
      const stateData = {
        type: 'state',
        position: bot.entity ? bot.entity.position : null,
        health: bot.health,
        food: bot.food,
        inventory: bot.inventory ? bot.inventory.items().map(i => ({ name: i.name, count: i.count })) : []
      };
      if (ws) sendToClient(ws, stateData);
      break;

    default:
      if (ws) sendToClient(ws, { type: 'response', status: 'unknown_action', action: cmd.action });
  }
}