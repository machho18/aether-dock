const { randomUUID } = require('node:crypto')
const { DatabaseSync } = require('node:sqlite')

const defaultTitle = '新对话'

// 创建 AI 会话持久层。界面消息与 Pi 的原生上下文文件分离，便于安全恢复与独立清理。
function createHuihuaStore(dbPath) {
  const db = new DatabaseSync(dbPath)
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;')
  db.exec(`
    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      piSessionFile TEXT,
      createdAt INTEGER NOT NULL,
      updatedAt INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      conversationId TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      role TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
      content TEXT NOT NULL DEFAULT '',
      pending INTEGER NOT NULL DEFAULT 0,
      failed INTEGER NOT NULL DEFAULT 0,
      startedAt INTEGER NOT NULL DEFAULT 0,
      completedAt INTEGER NOT NULL DEFAULT 0,
      outputTokens INTEGER NOT NULL DEFAULT 0,
      timeline TEXT NOT NULL DEFAULT '[]',
      createdAt INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS tool_calls (
      id TEXT PRIMARY KEY,
      messageId TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
      toolName TEXT NOT NULL DEFAULT '',
      label TEXT NOT NULL DEFAULT '',
      detail TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'completed',
      startedAt INTEGER NOT NULL DEFAULT 0,
      completedAt INTEGER NOT NULL DEFAULT 0,
      createdAt INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_messages_conversation_created ON messages(conversationId, createdAt);
    CREATE INDEX IF NOT EXISTS idx_tool_calls_message_created ON tool_calls(messageId, createdAt);
  `)
  // 兼容已创建的本地会话库，为模型速率补充输出 token 列。
  const messageColumns = db.prepare('PRAGMA table_info(messages)').all()
  if (!messageColumns.some((column) => column.name === 'outputTokens')) {
    db.exec('ALTER TABLE messages ADD COLUMN outputTokens INTEGER NOT NULL DEFAULT 0')
  }
  if (!messageColumns.some((column) => column.name === 'timeline')) {
    db.exec("ALTER TABLE messages ADD COLUMN timeline TEXT NOT NULL DEFAULT '[]'")
  }

  const listStmt = db.prepare(`
    SELECT conversation.id, conversation.title, conversation.piSessionFile, conversation.createdAt, conversation.updatedAt,
      (SELECT COUNT(*) FROM messages WHERE conversationId = conversation.id) AS messageCount,
      COALESCE((SELECT content FROM messages WHERE conversationId = conversation.id ORDER BY createdAt DESC LIMIT 1), '') AS preview
    FROM conversations AS conversation
    WHERE EXISTS (SELECT 1 FROM messages WHERE conversationId = conversation.id)
    ORDER BY conversation.createdAt DESC, conversation.id DESC
  `)
  const getConversationStmt = db.prepare('SELECT id, title, piSessionFile, createdAt, updatedAt FROM conversations WHERE id = ?')
  const getMessagesStmt = db.prepare('SELECT id, role, content, pending, failed, startedAt, completedAt, outputTokens, timeline, createdAt FROM messages WHERE conversationId = ? ORDER BY createdAt ASC')
  const getToolCallsStmt = db.prepare('SELECT id, messageId, toolName, label, detail, status, startedAt, completedAt, createdAt FROM tool_calls WHERE messageId = ? ORDER BY createdAt ASC')
  const createConversationStmt = db.prepare('INSERT INTO conversations (id, title, piSessionFile, createdAt, updatedAt) VALUES (?, ?, NULL, ?, ?)')
  const updateConversationStmt = db.prepare('UPDATE conversations SET title = ?, updatedAt = ? WHERE id = ?')
  const updateSessionFileStmt = db.prepare('UPDATE conversations SET piSessionFile = ? WHERE id = ?')
  const touchConversationStmt = db.prepare('UPDATE conversations SET updatedAt = ? WHERE id = ?')
  const deleteConversationStmt = db.prepare('DELETE FROM conversations WHERE id = ?')
  const listEmptyConversationStmt = db.prepare('SELECT piSessionFile FROM conversations WHERE NOT EXISTS (SELECT 1 FROM messages WHERE conversationId = conversations.id)')
  const deleteEmptyConversationStmt = db.prepare('DELETE FROM conversations WHERE NOT EXISTS (SELECT 1 FROM messages WHERE conversationId = conversations.id)')
  const deleteMessagesStmt = db.prepare('DELETE FROM messages WHERE conversationId = ?')
  const insertMessageStmt = db.prepare(`
    INSERT INTO messages (id, conversationId, role, content, pending, failed, startedAt, completedAt, outputTokens, timeline, createdAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
  const insertToolCallStmt = db.prepare(`
    INSERT INTO tool_calls (id, messageId, toolName, label, detail, status, startedAt, completedAt, createdAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)

  function duquHuihua(id) {
    const conversation = getConversationStmt.get(String(id ?? ''))
    if (!conversation) return null
    const messages = getMessagesStmt.all(conversation.id).map((message) => ({
      ...message,
      pending: Boolean(message.pending),
      failed: Boolean(message.failed),
      timeline: jiexiShixuKuai(message.timeline),
      toolCalls: getToolCallsStmt.all(message.id),
      isActivityOpen: false,
    }))
    return { ...conversation, messages, messageCount: messages.length }
  }

  function chuangjianHuihua() {
    const now = Date.now()
    const conversation = { id: randomUUID(), title: defaultTitle, piSessionFile: null, createdAt: now, updatedAt: now, messageCount: 0 }
    createConversationStmt.run(conversation.id, conversation.title, now, now)
    return conversation
  }

  function baocunHuihua(id, rawMessages) {
    const conversation = getConversationStmt.get(String(id ?? ''))
    if (!conversation) throw new Error('会话不存在')
    const messages = Array.isArray(rawMessages) ? rawMessages : []
    const now = Date.now()
    const firstUserMessage = messages.find((message) => message?.role === 'user' && String(message.content ?? '').trim())
    const title = conversation.title === defaultTitle && firstUserMessage
      ? jianhuaBiaoti(firstUserMessage.content)
      : conversation.title

    db.exec('BEGIN IMMEDIATE')
    try {
      deleteMessagesStmt.run(conversation.id)
      for (const rawMessage of messages) {
        const messageId = String(rawMessage?.id ?? randomUUID())
        const createdAt = zuzhengShijian(rawMessage?.createdAt, now)
        insertMessageStmt.run(
          messageId,
          conversation.id,
          rawMessage?.role === 'user' ? 'user' : 'assistant',
          String(rawMessage?.content ?? ''),
          rawMessage?.pending ? 1 : 0,
          rawMessage?.failed ? 1 : 0,
          zuzhengShijian(rawMessage?.startedAt, 0),
          zuzhengShijian(rawMessage?.completedAt, 0),
          zuzhengZhengshu(rawMessage?.outputTokens, 0),
          JSON.stringify(Array.isArray(rawMessage?.timeline) ? rawMessage.timeline : []),
          createdAt,
        )
        for (const rawTool of rawMessage?.toolCalls ?? []) {
          insertToolCallStmt.run(
            String(rawTool?.id ?? randomUUID()),
            messageId,
            String(rawTool?.name ?? ''),
            String(rawTool?.label ?? '处理中'),
            String(rawTool?.detail ?? ''),
            String(rawTool?.status ?? 'completed'),
            zuzhengShijian(rawTool?.startedAt, 0),
            zuzhengShijian(rawTool?.completedAt, 0),
            createdAt,
          )
        }
      }
      updateConversationStmt.run(title, now, conversation.id)
      db.exec('COMMIT')
      return { id: conversation.id, title, updatedAt: now, messageCount: messages.length }
    } catch (error) {
      db.exec('ROLLBACK')
      throw error
    }
  }

  function jianhuaBiaoti(rawText) {
    const text = String(rawText ?? '').replace(/\s+/g, ' ').trim()
    return text.length > 26 ? `${text.slice(0, 26)}…` : text || defaultTitle
  }

  function zuzhengShijian(value, fallback) {
    const time = Number(value)
    return Number.isFinite(time) && time > 0 ? Math.round(time) : fallback
  }

  function zuzhengZhengshu(value, fallback) {
    const number = Number(value)
    return Number.isFinite(number) && number >= 0 ? Math.round(number) : fallback
  }

  // 旧会话或异常数据回退为空数组，避免单条历史记录阻断整个会话加载。
  function jiexiShixuKuai(rawTimeline) {
    try {
      const timeline = JSON.parse(String(rawTimeline ?? '[]'))
      return Array.isArray(timeline) ? timeline : []
    } catch {
      return []
    }
  }

  return {
    liechuHuihua: () => listStmt.all(),
    // 清理旧版本残留的空白会话，并交由主进程回收对应 Pi 上下文文件。
    qingliKongbaiHuihua: () => {
      const conversations = listEmptyConversationStmt.all()
      deleteEmptyConversationStmt.run()
      return conversations
    },
    duquHuihua,
    chuangjianHuihua,
    baocunHuihua,
    // 切换 Pi 上下文只更新会话文件，不应影响用户看到的会话排序。
    shezhiPiSessionFile: (id, file) => updateSessionFileStmt.run(String(file ?? ''), String(id ?? '')),
    chongMingmingHuihua: (id, title) => updateConversationStmt.run(jianhuaBiaoti(title), Date.now(), String(id ?? '')),
    shanchuHuihua: (id) => deleteConversationStmt.run(String(id ?? '')),
    touchHuihua: (id) => touchConversationStmt.run(Date.now(), String(id ?? '')),
    close: () => db.close(),
  }
}

module.exports = { createHuihuaStore }
