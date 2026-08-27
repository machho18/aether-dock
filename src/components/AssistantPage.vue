<template>
  <section class="assistant-page" aria-label="AI 助手" @click="guanbiTuiliCaidan">
    <header class="assistant-topbar">
      <button class="assistant-back" type="button" aria-label="返回资料库" title="返回资料库" @click.stop="emit('back')">
        <PhArrowLeft :size="16" weight="bold" />
      </button>
      <div class="assistant-identity">
        <span class="assistant-identity-mascot" aria-hidden="true">
          <img class="assistant-identity-icon" :src="aiBiaotiIcon" alt="">
        </span>
        <div class="assistant-heading">
          <strong>AI 助手</strong>
          <small>{{ currentModelName }}</small>
        </div>
      </div>
      <button
        class="assistant-action"
        :class="{ 'assistant-action--active': isConfigOpen }"
        type="button"
        aria-label="配置模型"
        :aria-pressed="isConfigOpen"
        title="配置模型"
        @click.stop="qiehuanConfigPanel"
      >
        <PhKey :size="15" weight="bold" />
      </button>
    </header>

    <Transition name="assistant-config">
      <section v-if="isConfigOpen" class="assistant-config-panel" aria-label="模型配置">
        <nav class="assistant-config-tabs" aria-label="配置分类">
          <button type="button" :class="{ 'is-active': configTab === 'model' }" :disabled="!status?.models?.length" @click="configTab = 'model'">模型</button>
          <button type="button" :class="{ 'is-active': configTab === 'provider' }" @click="configTab = 'provider'">供应商</button>
        </nav>

        <div v-if="configTab === 'model'" class="assistant-config-view">
          <div class="assistant-model-manager">
            <section v-if="currentModel" class="assistant-current-model" aria-label="当前使用的模型">
              <span class="assistant-current-model-dot" aria-hidden="true"></span>
              <div class="assistant-current-model-copy">
                <span class="assistant-section-label">正在使用</span>
                <strong>{{ currentModel.name }}</strong>
                <small>{{ currentModelProviderName }}</small>
              </div>
            </section>

            <div class="assistant-model-list" aria-label="可用模型">
              <div class="assistant-model-list-heading">
                <span class="assistant-section-label">可用模型</span>
                <span>{{ moxingMatchCount }} / {{ status?.models?.length ?? 0 }} 个</span>
              </div>

              <label class="assistant-field assistant-model-filter">
                <span>筛选模型</span>
                <span class="assistant-model-search">
                  <PhMagnifyingGlass :size="14" aria-hidden="true" />
                  <input v-model="moxingKeyword" type="search" placeholder="按名称或 ID 搜索" autocomplete="off">
                </span>
              </label>

              <!-- 分批展示完整模型目录，避免大型供应商列表一次性创建大量节点。 -->
              <section v-for="group in visibleModelGroups" :key="group.provider" class="assistant-provider-group">
                <div class="assistant-provider-group-heading">
                  <span>{{ group.name }}</span>
                  <span v-if="modelGroups.length > 1">{{ group.matchedCount }} 个模型</span>
                </div>
                <div class="assistant-model-options">
                  <button
                    v-for="model in group.models"
                    :key="`${model.provider}/${model.id}`"
                    class="assistant-model-option"
                    :class="{ 'assistant-model-option--current': isCurrentModel(model) }"
                    type="button"
                    :disabled="isSavingKey || isSwitchingModel || isCurrentModel(model)"
                    @click="qiehuanModel(model)"
                  >
                    <span class="assistant-model-option-copy">
                      <strong>{{ model.name }}</strong>
                      <small>{{ model.id }}</small>
                    </span>
                    <span v-if="isCurrentModel(model)" class="assistant-model-option-current" aria-label="当前使用">
                      <PhCheck :size="14" weight="bold" />
                    </span>
                    <span v-else class="assistant-model-option-action">切换</span>
                  </button>
                </div>
                <button v-if="group.remainingCount" class="assistant-model-more" type="button" @click="zengjiaMoxingZhanshi(group.provider)">
                  显示更多（剩余 {{ group.remainingCount }} 个）
                </button>
              </section>
              <p v-if="!visibleModelGroups.length" class="assistant-configured assistant-configured--empty">没有匹配的模型。</p>
            </div>

          </div>
        </div>

        <div v-else class="assistant-config-view">
          <div class="assistant-config-sub">
            <div class="assistant-config-subtitle">供应商配置</div>
            <div class="assistant-config-row">
              <div class="assistant-field assistant-field--provider">
                <span>供应商</span>
                <div class="assistant-provider-picker">
                  <button
                    class="assistant-provider-trigger"
                    type="button"
                    :aria-expanded="isProviderMenuOpen"
                    aria-haspopup="listbox"
                    :disabled="isSavingKey || isRemovingProvider"
                    @click="isProviderMenuOpen = !isProviderMenuOpen"
                    @keydown.esc="isProviderMenuOpen = false"
                  >
                    <span>{{ selectedProviderName }}</span>
                    <PhCaretDown :size="13" weight="bold" aria-hidden="true" />
                  </button>

                  <!-- 保持供应商列表在应用内呈现，避免系统下拉框样式割裂。 -->
                  <div v-if="isProviderMenuOpen" class="assistant-provider-menu" role="listbox" aria-label="选择供应商">
                    <section v-if="neizhiProviderList.length" class="assistant-provider-group" aria-label="内置供应商">
                      <p class="assistant-provider-group-label">内置供应商</p>
                      <button
                        v-for="provider in neizhiProviderList"
                        :key="provider.id"
                        class="assistant-provider-option"
                        :class="{ 'assistant-provider-option--selected': selectedProvider === provider.id }"
                        type="button"
                        role="option"
                        :aria-selected="selectedProvider === provider.id"
                        @click="qiehuanProvider(provider.id)"
                      >
                        <span>{{ provider.name }}</span>
                        <PhCheck v-if="selectedProvider === provider.id" :size="13" weight="bold" aria-hidden="true" />
                      </button>
                    </section>
                    <section v-if="zidingyiProviderList.length" class="assistant-provider-group" aria-label="自定义供应商">
                      <p class="assistant-provider-group-label">自定义供应商</p>
                      <button
                        v-for="provider in zidingyiProviderList"
                        :key="provider.id"
                        class="assistant-provider-option"
                        :class="{ 'assistant-provider-option--selected': selectedProvider === provider.id }"
                        type="button"
                        role="option"
                        :aria-selected="selectedProvider === provider.id"
                        @click="qiehuanProvider(provider.id)"
                      >
                        <span>{{ provider.name }}</span>
                        <PhCheck v-if="selectedProvider === provider.id" :size="13" weight="bold" aria-hidden="true" />
                      </button>
                    </section>
                  </div>
                </div>
              </div>
              <label class="assistant-field assistant-field--key">
                <span>API 密钥</span>
                <input v-model="apiKey" :type="keyInputType" placeholder="sk-..." autocomplete="off" @focus="chuliApiKeyFocus" @blur="chuliApiKeyBlur">
              </label>
            </div>
            <div class="assistant-provider-actions">
              <button class="assistant-save" type="button" :disabled="isSavingKey || isRemovingProvider || !apiKey.trim() || (currentSelectedProvider?.configured && apiKey.trim() === (currentSelectedProvider.apiKeyMask || keyMask))" @mousedown.prevent @click="baocunProviderKey">
                {{ isSavingKey ? '保存中…' : '保存密钥' }}
              </button>
              <button
                v-if="currentSelectedProvider"
                class="assistant-provider-clean"
                type="button"
                :disabled="isSavingKey || isRemovingProvider || isBusy || (!currentSelectedProvider.custom && !currentSelectedProvider.configured)"
                @click="qingqiuGongyingshangQingli"
              >
                <PhTrash :size="13" weight="bold" aria-hidden="true" />
                {{ currentSelectedProvider.custom ? '删除供应商' : '移除供应商配置' }}
              </button>
            </div>
          </div>

          <div class="assistant-config-sub">
            <div class="assistant-config-subtitle">自定义供应商</div>
            <div class="assistant-field">
              <span>接口协议</span>
              <div class="assistant-protocol-switch" role="group" aria-label="选择接口协议">
                <button
                  class="assistant-protocol-option"
                  :class="{ 'assistant-protocol-option--selected': customXieyi === 'openai' }"
                  type="button"
                  :aria-pressed="customXieyi === 'openai'"
                  @click="customXieyi = 'openai'"
                >OpenAI 兼容</button>
                <button
                  class="assistant-protocol-option"
                  :class="{ 'assistant-protocol-option--selected': customXieyi === 'anthropic' }"
                  type="button"
                  :aria-pressed="customXieyi === 'anthropic'"
                  @click="customXieyi = 'anthropic'"
                >Anthropic 兼容</button>
              </div>
            </div>
            <label class="assistant-field">
              <span>名称（可留空，按路径自动识别）</span>
              <input v-model="customName" type="text" placeholder="自动识别" autocomplete="off">
            </label>
            <label class="assistant-field">
              <span>API 路径</span>
              <input v-model="customUrl" type="text" :placeholder="customLuJingPlaceholder" autocomplete="off">
            </label>
            <label class="assistant-field">
              <span>模型 ID（选填）</span>
              <input v-model="customModelId" type="text" :placeholder="customMoxingPlaceholder" autocomplete="off">
            </label>
            <label class="assistant-field">
              <span>密钥</span>
              <input v-model="customKey" type="password" placeholder="sk-..." autocomplete="off">
            </label>
            <button class="assistant-save assistant-save--primary" type="button" :disabled="isAddingProvider" @click="tianjiaCustomProvider">
              {{ isAddingProvider ? '接入中…' : customModelId.trim() ? '接入模型' : '识别并接入' }}
            </button>
          </div>

          <div class="assistant-config-sub">
            <div class="assistant-config-subtitle">联网搜索</div>
            <div class="assistant-field">
              <span>搜索来源</span>
              <div class="assistant-search-source" role="radiogroup" aria-label="选择搜索来源">
                <button
                  class="assistant-search-source-option"
                  :class="{ 'assistant-search-source-option--active': searchProvider === 'bing' }"
                  type="button"
                  role="radio"
                  :aria-checked="searchProvider === 'bing'"
                  :disabled="isSavingSearchKey"
                  @click="qiehuanSearchSource('bing')"
                >
                  <span class="assistant-search-source-copy">
                    <strong>必应 Bing</strong>
                    <small>免费、无需密钥的网页搜索</small>
                  </span>
                  <span class="assistant-search-source-state">
                    <template v-if="searchProvider === 'bing'"><PhCheck :size="12" weight="bold" /> 使用中</template>
                    <template v-else>切换</template>
                  </span>
                </button>
                <button
                  class="assistant-search-source-option"
                  :class="{ 'assistant-search-source-option--active': searchProvider === 'anysearch' }"
                  type="button"
                  role="radio"
                  :aria-checked="searchProvider === 'anysearch'"
                  :disabled="isSavingSearchKey"
                  @click="qiehuanSearchSource('anysearch')"
                >
                  <span class="assistant-search-source-copy">
                    <strong>AnySearch</strong>
                    <small>高质量结果，可用 API Key 解锁更多配额</small>
                  </span>
                  <span class="assistant-search-source-state">
                    <template v-if="searchProvider === 'anysearch'"><PhCheck :size="12" weight="bold" /> 使用中</template>
                    <template v-else>切换</template>
                  </span>
                </button>
              </div>
            </div>
            <template v-if="searchProvider === 'anysearch'">
              <label class="assistant-field">
                <span>API 密钥（选填）</span>
                <input v-model="anysearchKey" :type="anysearchKeyInputType" placeholder="留空则使用匿名配额" autocomplete="off" @focus="chuliAnySearchKeyFocus" @blur="chuliAnySearchKeyBlur">
              </label>
              <p class="assistant-search-note">匿名访问无需注册即可低频使用，但速率限制（QPS）与每日免费额度处于最低配额状态；注册并创建免费 API Key 后解锁标准免费额度——每天 1,000 次请求、单 Key 限速 20 QPS。详见 <button class="assistant-search-link" type="button" @click="dakaiAnySearchGuize">AnySearch 配额说明</button>。</p>
              <div class="assistant-provider-actions">
                <button class="assistant-save" type="button" :disabled="isSavingSearchKey || (isAnySearchKeyConfigured && anysearchKey.trim() === (anysearchKeyMask || keyMask))" @mousedown.prevent @click="tijiaoAnySearchKey">
                  {{ isSavingSearchKey ? '保存中…' : '保存密钥' }}
                </button>
                <button v-if="isAnySearchKeyConfigured" class="assistant-provider-clean" type="button" :disabled="isSavingSearchKey || isBusy" @click="qingchuAnySearchKey">
                  <PhTrash :size="13" weight="bold" aria-hidden="true" />
                  清除密钥
                </button>
              </div>
            </template>
          </div>
        </div>

        <p v-if="statusError" class="assistant-configured assistant-configured--error" role="alert">{{ statusError }}</p>
      </section>
    </Transition>

    <Transition name="assistant-document">
      <section v-if="isDocumentationOpen" class="assistant-document-panel" aria-label="AI 助手使用文档">
        <header class="assistant-document-header">
          <div>
            <strong>使用说明</strong>
            <small>AI 助手</small>
          </div>
          <button type="button" aria-label="关闭使用文档" title="关闭" @click="isDocumentationOpen = false">
            <PhX :size="17" weight="bold" />
          </button>
        </header>
        <div class="assistant-document-content">
          <section class="assistant-document-intro" aria-labelledby="assistant-document-title">
            <h1 id="assistant-document-title">AI 助手使用说明</h1>
            <p class="assistant-document-subtitle">从配置模型到完成一个任务</p>
            <p>先配置模型，然后说明目标、材料和期待的结果。助手会根据需要检索资料库或联网查找。</p>
            <div class="assistant-document-ready">
              <span class="assistant-document-ready-dot" :class="{ 'assistant-document-ready-dot--active': currentModel }" aria-hidden="true"></span>
              <div>
                <small>当前状态</small>
                <strong>{{ currentModel ? `已连接 ${currentModel.name}` : '尚未配置模型' }}</strong>
              </div>
              <button type="button" @click="dakaiWendangPeizhi">
                {{ currentModel ? '管理模型' : '配置模型' }}
                <PhKey :size="13" weight="bold" aria-hidden="true" />
              </button>
            </div>
          </section>

          <section class="assistant-document-section" aria-labelledby="assistant-document-step-title">
            <h2 id="assistant-document-step-title">开始使用</h2>
            <ol class="assistant-document-steps" aria-label="开始使用步骤">
              <li><strong>配置模型</strong><span>点击顶部钥匙图标，选择供应商并保存 API 密钥。</span></li>
              <li><strong>描述任务</strong><span>在输入框说明你要整理、查找或生成什么。</span></li>
              <li><strong>继续追问</strong><span>不满意时直接补充要求，例如“再精简一些”。</span></li>
            </ol>
          </section>

          <section class="assistant-document-section" aria-labelledby="assistant-document-example-title">
            <div>
            <h2 id="assistant-document-example-title">示例提问</h2>
            <p>点击示例会带入输入框，你可以先修改再发送。</p>
            </div>
            <div class="assistant-document-example-list">
              <button v-for="example in shiyongWendangShili" :key="example.title" type="button" @click="shiyongWendangShiliTianru(example.prompt)">
                <strong>{{ example.title }}</strong>
                <span>{{ example.prompt }}</span>
              </button>
            </div>
          </section>

          <div class="assistant-document-body assistant-markdown" aria-label="详细使用说明" v-html="aiZhushouShiyongWendangHtml"></div>
        </div>
      </section>
    </Transition>

    <div class="assistant-conversation-layout" :class="{ 'assistant-conversation-layout--with-sidebar': isConversationPanelOpen }">
      <aside
        id="assistant-conversation-sidebar"
        class="assistant-conversation-sidebar"
        :class="{ 'assistant-conversation-sidebar--collapsed': !isConversationPanelOpen }"
        :aria-hidden="!isConversationPanelOpen"
        :inert="!isConversationPanelOpen"
        aria-label="会话列表"
      >
        <div class="assistant-conversation-header">
          <span>对话</span>
          <small>{{ conversations.length }}</small>
        </div>
        <button class="assistant-new-conversation" type="button" :disabled="isBusy" @click="xinJianHuihua">
          <PhPlus :size="15" weight="bold" />
          <span>新建对话</span>
        </button>
        <div class="assistant-conversation-list">
          <section v-for="group in huihuaFenZu" :key="group.label" class="assistant-conversation-group">
            <h2>{{ group.label }}</h2>
            <div v-for="conversation in group.items" :key="conversation.id" class="assistant-conversation-row" :class="{ 'is-active': conversation.id === currentConversationId }">
              <button
                class="assistant-conversation-item"
                type="button"
                :disabled="isBusy"
                :title="conversation.title"
                @click="qiehuanHuihua(conversation.id)"
              >
                <span class="assistant-conversation-title">{{ conversation.title }}</span>
                <span
                  v-if="isBusy && conversation.id === currentConversationId"
                  class="assistant-conversation-loading"
                  role="status"
                  aria-label="正在生成回复"
                ></span>
              </button>
              <button
                class="assistant-conversation-delete"
                type="button"
                :disabled="isBusy"
                :aria-label="`删除对话：${conversation.title}`"
                title="删除对话"
                @click.stop="qingqiuShanchuHuihua(conversation)"
              >
                <PhTrash :size="13" weight="bold" />
              </button>
            </div>
          </section>
          <p v-if="!huihuaFenZu.length" class="assistant-conversation-empty">还没有对话</p>
        </div>
      </aside>
      <button
        v-if="!isDocumentationOpen && !isConfigOpen"
        class="assistant-conversation-toggle"
        :class="{ 'assistant-conversation-toggle--open': isConversationPanelOpen }"
        type="button"
        aria-controls="assistant-conversation-sidebar"
        :aria-expanded="isConversationPanelOpen"
        :aria-label="isConversationPanelOpen ? '收起会话列表' : '展开会话列表'"
        :title="isConversationPanelOpen ? '收起会话列表' : '展开会话列表'"
        @click="isConversationPanelOpen = !isConversationPanelOpen"
      >
        <PhCaretRight class="assistant-conversation-toggle-icon" :class="{ 'assistant-conversation-toggle-icon--open': isConversationPanelOpen }" :size="14" weight="bold" aria-hidden="true" />
      </button>

      <main class="assistant-chat-pane">
    <div ref="messagesLayer" class="assistant-messages" aria-live="polite" @scroll.passive="chuliXiaoxiGunDong">
      <div v-if="!messages.length" class="assistant-empty">
        <div class="assistant-empty-intro">
          <div class="assistant-empty-copy">
            <strong class="assistant-empty-title" :aria-label="huanyingYuanwen">
              {{ huanyingYiShuru }}<span v-if="isHuanyingDaziWancheng" class="assistant-empty-cursor" aria-hidden="true">_</span>
            </strong>
            <button class="assistant-documentation-link" type="button" @click="dakaiShiyongWendang">
              <PhBookOpen :size="14" weight="bold" aria-hidden="true" />
              使用文档
            </button>
          </div>
        </div>
      </div>

      <template v-for="(message, index) in messages" :key="message.id">
      <article v-if="!yinggaiYincangShouquanQianXiaoxi(message, index)" class="assistant-bubble" :class="`assistant-bubble--${message.role}`">
        <img v-if="message.role === 'assistant'" class="assistant-message-avatar" :src="aiHuiFuIcon" alt="" aria-hidden="true">
        <div
          class="assistant-bubble-inner"
          :class="{
            'assistant-bubble-inner--error': message.failed,
            'assistant-bubble-inner--activity': message.role === 'assistant' && !message.content && message.pending,
          }"
        >
          <template v-if="message.role === 'assistant' && yinggaiXianshiGongjuJilu(message)">
            <div class="assistant-activity">
              <div class="assistant-reasoning" :class="{ 'assistant-reasoning--pending': message.pending, 'assistant-reasoning--failed': message.failed, 'assistant-reasoning--completed': !message.pending && !message.failed }">
                <div class="assistant-reasoning-trigger">
                  <span class="assistant-reasoning-duration">{{ huoquChuliXiangqing(message) }}</span>
                </div>
              </div>
            </div>
            <div class="assistant-tool-stream">
              <template v-for="block in huoquGongjuChuliKuai(message)" :key="block.id">
                <div v-if="block.type === 'text'" class="assistant-activity-note assistant-markdown" v-html="xuanzaiMarkdown(block.content)"></div>
                <details v-else-if="block.type === 'tool'" class="assistant-tool-call" :class="`assistant-tool-call--${block.tool.status}`" :open="block.tool.status !== 'completed'">
                  <summary>
                    <span class="assistant-tool-call-label" :class="{ 'assistant-status-shimmer': block.tool.status === 'running' }">{{ block.tool.label }}</span>
                    <small>{{ huoquToolZhuangtaiWenAn(block.tool) }}</small>
                  </summary>
                  <p v-if="block.tool.detail">{{ block.tool.detail }}</p>
                </details>
              </template>
            </div>
            <div v-if="yinggaiXianshiWenjianShengcheng(message)" class="assistant-activity-generating">
              <span aria-hidden="true"></span>
              {{ huoquWenjianShengchengWenAn(message) }}
            </div>
            <div v-else-if="yinggaiXianshiLiuShiDengdai(message)" class="assistant-activity-waiting">
              <span aria-hidden="true"></span>
              {{ huoquLiuShiDengdaiWenAn(message) }}
            </div>
            <div v-else-if="yinggaiXianshiSikao(message)" class="assistant-activity-thinking">
              <span aria-hidden="true"></span>
              正在思考
            </div>
            <template v-for="block in huoquGongjuJieguoKuai(message)" :key="block.id">
              <div class="assistant-write-result" :class="`assistant-write-result--${huoquXieruJieguo(block.content, block.type === 'approval-result').tone}`" role="status">
                <span class="assistant-write-result-icon" aria-hidden="true">
                  <PhX v-if="huoquXieruJieguo(block.content, block.type === 'approval-result').tone !== 'completed'" :size="13" weight="bold" />
                  <PhCheck v-else :size="13" weight="bold" />
                </span>
                <div>
                  <small>{{ block.type === 'approval-result' ? '授权结果' : '操作结果' }}</small>
                  <strong>{{ huoquXieruJieguo(block.content, block.type === 'approval-result').title }}</strong>
                  <p>{{ huoquXieruJieguo(block.content, block.type === 'approval-result').content }}</p>
                </div>
              </div>
            </template>
            <div v-if="huoquGongjuZuiZhongWenben(message)" class="assistant-markdown assistant-answer" v-html="xuanzaiMarkdown(huoquGongjuZuiZhongWenben(message))"></div>
          </template>
          <template v-else>
            <div
              v-if="message.role === 'assistant' && yinggaiXianshiChuliGuocheng(message)"
              class="assistant-activity"
            >
              <div class="assistant-reasoning" :class="{ 'assistant-reasoning--pending': message.pending, 'assistant-reasoning--failed': message.failed, 'assistant-reasoning--completed': !message.pending && !message.failed }">
                <div class="assistant-reasoning-trigger">
                  <span class="assistant-reasoning-duration">{{ huoquChuliXiangqing(message) }}</span>
                </div>
              </div>
            </div>
            <div v-if="message.role === 'assistant' && yinggaiXianshiWenjianShengcheng(message)" class="assistant-activity-generating">
              <span aria-hidden="true"></span>
              {{ huoquWenjianShengchengWenAn(message) }}
            </div>
            <div v-else-if="message.role === 'assistant' && yinggaiXianshiLiuShiDengdai(message)" class="assistant-activity-waiting">
              <span aria-hidden="true"></span>
              {{ huoquLiuShiDengdaiWenAn(message) }}
            </div>
            <div v-else-if="message.role === 'assistant' && yinggaiXianshiSikao(message)" class="assistant-activity-thinking">
              <span aria-hidden="true"></span>
              正在思考
            </div>
            <template v-if="message.role === 'assistant' && huoquShixuKuai(message).length">
              <template v-for="block in huoquShixuKuai(message)" :key="block.id">
                <div v-if="block.type === 'text'" class="assistant-markdown assistant-answer" v-html="xuanzaiMarkdown(block.content)"></div>
                <div v-else-if="block.type === 'approval-result' || block.type === 'operation-result'" class="assistant-write-result" :class="`assistant-write-result--${huoquXieruJieguo(block.content, block.type === 'approval-result').tone}`" role="status">
                  <span class="assistant-write-result-icon" aria-hidden="true">
                    <PhX v-if="huoquXieruJieguo(block.content, block.type === 'approval-result').tone !== 'completed'" :size="13" weight="bold" />
                    <PhCheck v-else :size="13" weight="bold" />
                  </span>
                  <div>
                    <small>{{ block.type === 'approval-result' ? '授权结果' : '操作结果' }}</small>
                    <strong>{{ huoquXieruJieguo(block.content, block.type === 'approval-result').title }}</strong>
                    <p>{{ huoquXieruJieguo(block.content, block.type === 'approval-result').content }}</p>
                  </div>
                </div>
              </template>
            </template>
            <div v-else-if="message.role === 'assistant' && message.content" class="assistant-markdown assistant-answer" v-html="xuanzaiMarkdown(message.content)"></div>
            <p v-else>{{ message.content }}</p>
          </template>
          <span v-if="message.role === 'assistant' && !message.pending && huoquTokenXiaohao(message)" class="assistant-token-usage">{{ huoquTokenXiaohao(message) }}</span>
        </div>
        <img v-if="message.role === 'user'" class="assistant-message-avatar assistant-message-avatar--user" :src="yonghuHuiFuIcon" alt="" aria-hidden="true">
      </article>
      </template>

      <!-- 资料库变更在对话流内等待授权，用户无需离开当前上下文。 -->
      <section v-if="ziliaokuShouquanQingqiu" class="assistant-library-approval" :class="{ 'assistant-library-approval--danger': ziliaokuShouquanQingqiu.tone === 'danger' }" role="group" :aria-label="huoquShouquanBiaoti(ziliaokuShouquanQingqiu)">
        <div class="assistant-library-approval-head">
          <span class="assistant-library-approval-icon" aria-hidden="true"><PhKey :size="15" weight="bold" /></span>
          <div>
            <small>需要授权</small>
            <strong>{{ huoquShouquanBiaoti(ziliaokuShouquanQingqiu) }}</strong>
          </div>
        </div>
        <p class="assistant-library-approval-message">{{ ziliaokuShouquanQingqiu.message }}</p>
        <ul v-if="huoquShouquanMingxi(ziliaokuShouquanQingqiu).length" class="assistant-library-approval-detail" aria-label="操作对象">
          <li v-for="detail in huoquShouquanMingxi(ziliaokuShouquanQingqiu)" :key="detail">{{ detail }}</li>
        </ul>
        <div class="assistant-library-approval-actions">
          <button class="assistant-library-approval-reject" type="button" @click="huiyingZiliaokuShouquan('reject')">拒绝</button>
          <button class="assistant-library-approval-allow" type="button" @click="huiyingZiliaokuShouquan('once')">允许本次</button>
          <button class="assistant-library-approval-always" type="button" @click="huiyingZiliaokuShouquan('always')">本次启动始终允许</button>
        </div>
      </section>
    </div>

    <footer class="assistant-composer" :class="{ 'assistant-composer--unavailable': !isStatusLoading && !currentModel }">
      <button
        v-if="isXianshiZuihouXiaoxi"
        class="assistant-latest-button"
        type="button"
        aria-label="回到最新消息"
        title="回到最新消息"
        @click="gunDaoZuihou"
      >
        <PhArrowDown :size="14" weight="bold" />
        <span>最新消息</span>
      </button>
      <div class="assistant-composer-input">
        <textarea
          ref="shuruKuang"
          v-model="draft"
          rows="1"
          :disabled="isStatusLoading || !currentModel"
          :placeholder="isStatusLoading ? '正在准备助手…' : currentModel ? '输入消息…' : '配置模型后开始对话'"
          aria-label="输入消息"
          @keydown.enter.exact.prevent="tijiaoXiaoxi"
          @input="zhengliShuruKuangGaodu"
        ></textarea>
      </div>
      <div class="assistant-composer-toolbar">
        <span v-if="isStatusLoading" class="assistant-composer-status">正在准备助手</span>
        <button v-else-if="!currentModel" class="assistant-composer-setup" type="button" @click="dakaiGongyingshangConfig">
          <PhKey :size="14" weight="bold" aria-hidden="true" />
          <span>配置模型</span>
        </button>
        <span v-else-if="currentModel" class="assistant-search-indicator" :title="`联网搜索来源：${sousuoLaiYuanMingcheng}`" aria-label="当前联网搜索来源">
          <img :src="lianwangSousuoIcon" alt="" aria-hidden="true" draggable="false">
          <span>{{ sousuoLaiYuanMingcheng }}</span>
        </span>
        <div class="assistant-composer-actions">
          <div v-if="currentModel" class="assistant-composer-meta">
            <button
              class="assistant-thinking-trigger"
              type="button"
              :class="{ 'assistant-thinking-trigger--open': isThinkingMenuOpen }"
              :disabled="!tuiliQiangduList.length || isBusy || isSwitchingThinking"
              :aria-expanded="isThinkingMenuOpen"
              :aria-label="`推理强度：${tuiliQiangduList.length ? huoquTuiliQiangduMingcheng(currentModel.thinkingLevel) : '不可用'}`"
              aria-haspopup="menu"
              :title="tuiliQiangduList.length ? `推理强度：${huoquTuiliQiangduMingcheng(currentModel.thinkingLevel)}` : '当前模型不支持推理强度设置'"
              @click.stop="isThinkingMenuOpen = !isThinkingMenuOpen"
            >
              <PhLightning :size="16" weight="fill" aria-hidden="true" />
              <span v-if="tuiliQiangduList.length" class="assistant-thinking-level">{{ huoquTuiliQiangduMingcheng(currentModel.thinkingLevel) }}</span>
            </button>
            <div v-if="isThinkingMenuOpen" class="assistant-thinking-menu" role="menu" aria-label="选择推理强度" @click.stop>
              <button
                v-for="level in tuiliQiangduList"
                :key="level"
                type="button"
                role="menuitemradio"
                :class="{ 'is-active': level === currentModel.thinkingLevel }"
                :aria-checked="level === currentModel.thinkingLevel"
                :disabled="isSwitchingThinking || level === currentModel.thinkingLevel"
                @click="qiehuanTuiliQiangdu(level)"
              >
                <span>{{ huoquTuiliQiangduMingcheng(level) }}</span>
                <PhCheck v-if="level === currentModel.thinkingLevel" :size="13" weight="bold" aria-hidden="true" />
              </button>
            </div>
          </div>
          <button
            v-if="isBusy"
            class="assistant-send assistant-send--stop"
            type="button"
            aria-label="停止生成"
            title="停止生成"
            @click="zhongzhi"
          >
            <PhStop :size="15" weight="fill" />
          </button>
          <button v-else class="assistant-send" type="button" aria-label="发送" title="发送" :disabled="isStatusLoading || !currentModel || !draft.trim()" @click="tijiaoXiaoxi">
            <PhPaperPlaneRight :size="15" weight="bold" />
          </button>
        </div>
      </div>
    </footer>
      </main>
    </div>
  </section>
</template>

<script setup>
import { PhArrowDown, PhArrowLeft, PhBookOpen, PhCaretDown, PhCaretRight, PhCheck, PhKey, PhLightning, PhMagnifyingGlass, PhPaperPlaneRight, PhPlus, PhStop, PhTrash, PhX } from '@phosphor-icons/vue'
import { useSessionStorage } from '@vueuse/core'
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { usePiAssistant } from '@/composables/usePiAssistant'
import { tuidaoCompatibleXieyi, tuidaoProviderName } from '@/utils/provider-name'
import { xuanzaiMarkdown } from '@/utils/markdown'
import aiBiaotiIcon from '@/assets/images/ai-title-mascot.png'
import aiHuiFuIcon from '@/assets/images/chat-assistant-avatar.png'
import yonghuHuiFuIcon from '@/assets/images/chat-user-avatar.png'
import lianwangSousuoIcon from '@/assets/icons/lianwang-sousuo.svg'
import aiZhushouShiyongWendang from '../../docs/ai-assistant-guide.md?raw'

const emit = defineEmits(['back', 'request-provider-cleanup', 'request-conversation-delete'])

const {
  messages,
  isBusy,
  status,
  isStatusLoading,
  statusError,
  isSavingKey,
  isRemovingProvider,
  ziliaokuShouquanQingqiu,
  conversations,
  currentConversationId,
  isConversationLoading,
  jiazaiStatus,
  jiazaiHuihua,
  xinJianHuihua,
  qiehuanHuihua,
  shanchuHuihua,
  faSong,
  zhongzhi,
  huiyingZiliaokuShouquan,
  shezhiProviderKey,
  xuanzeModel,
  shezhiTuiliQiangdu,
  addProvider,
  qingliProvider,
  searchProvider,
  isAnySearchKeyConfigured,
  anysearchKeyMask,
  isSavingSearchKey,
  jiazaiSearchConfig,
  shezhiSearchProvider,
  baocunAnySearchApiKey,
  kaishiJianting,
} = usePiAssistant()

// 授权卡片跟随对话流出现，并在渲染后自动滚动到可见位置。
watch(ziliaokuShouquanQingqiu, (request) => {
  if (request) nextTick(gunDaoZuihou)
})

onUnmounted(() => {
  if (ziliaokuShouquanQingqiu.value) void huiyingZiliaokuShouquan('reject')
})

const draft = ref('')
const messagesLayer = ref(null)
const shuruKuang = ref(null)
// 默认收起会话记录，让首次进入时只保留当前对话。
const isConversationPanelOpen = ref(false)
const isConfigOpen = ref(false)
const isDocumentationOpen = ref(false)
const configTab = useSessionStorage('aetherdock:pi-config-tab', 'model')
const selectedProvider = ref('')
const apiKey = ref('')
const keyInputType = ref('password')
const isProviderMenuOpen = ref(false)
const isSwitchingModel = ref(false)
const isSwitchingThinking = ref(false)
const isThinkingMenuOpen = ref(false)
// 名称、路径与模型 ID 仅在当前应用会话暂存，API Key 不写入浏览器存储。
const customName = useSessionStorage('aetherdock:pi-custom-provider-name', '')
const customUrl = useSessionStorage('aetherdock:pi-custom-provider-url', '')
const customModelId = useSessionStorage('aetherdock:pi-custom-provider-model-id', '')
const customXieyi = useSessionStorage('aetherdock:pi-custom-provider-protocol', 'openai')
const customKey = ref('')
let zidingyiMingchengLastAuto = ''
const isAddingProvider = ref(false)
const keyMask = '••••••'
const anysearchKey = ref('')
const anysearchKeyInputType = ref('password')
const ANYSEARCH_GUIZE_URL = 'https://www.anysearch.com/pricing'
const moxingKeyword = ref('')
const moxingZhanshiCount = ref({})
let scrollFrame = 0
let chuliJishiTimer = 0
let chushihuaZhen = 0
let chushihuaTimer = 0
const modelBatchSize = 80
const isJinZuihou = ref(true)
const zuihouJuliYuzhi = 72
const chuliJishiNow = ref(Date.now())
const liushiDengdaiYuzhi = 1200
const liushiChangDengdaiYuzhi = 8000

function isGongjuJinxing(message) {
  return message?.toolCalls?.some((tool) => tool.status === 'running') ?? false
}

// 已有可见回复时不再显示思考状态，避免与正文重复表达处理进度。
function yinggaiXianshiSikao(message) {
  return Boolean(message?.pending && !isGongjuJinxing(message) && !String(message?.content ?? '').trim())
}

// 文件已获授权但工具尚未启动时，使用专用生成状态衔接两个阶段。
function yinggaiXianshiWenjianShengcheng(message) {
  return Boolean(message?.pending && message?.wenjianShengchengZhong && message?.wenjianShengchengWenAn)
}

function huoquWenjianShengchengWenAn(message) {
  return String(message?.wenjianShengchengWenAn ?? '正在生成文件')
}

// 已输出内容后的短暂静默仍应说明处理状态，避免等待期间留下无提示空白。
function huoquLiuShiDengdaiHaoshi(message) {
  return Math.max(0, chuliJishiNow.value - Number(message?.lastActivityAt ?? message?.startedAt ?? 0))
}

function yinggaiXianshiLiuShiDengdai(message) {
  return Boolean(
    message?.pending
    && !isGongjuJinxing(message)
    && !yinggaiXianshiWenjianShengcheng(message)
    && String(message?.content ?? '').trim()
    && huoquLiuShiDengdaiHaoshi(message) >= liushiDengdaiYuzhi,
  )
}

function huoquLiuShiDengdaiWenAn(message) {
  return huoquLiuShiDengdaiHaoshi(message) >= liushiChangDengdaiYuzhi
    ? '仍在处理，可停止后重试'
    : '正在继续处理'
}

// 时序块直接映射到工具详情，确保每次调用都按流式事件抵达的先后显示。
function huoquShixuKuai(message) {
  const tools = new Map((message?.toolCalls ?? []).map((tool) => [tool.id, tool]))
  return (message?.timeline ?? [])
    .map((block) => block.type === 'tool'
      ? { ...block, tool: tools.get(block.toolId) }
      : { ...block, content: String(block.content ?? '') })
    .filter((block) => block.type === 'tool'
      ? Boolean(block.tool)
      : ['text', 'approval-result', 'operation-result'].includes(block.type) && Boolean(block.content))
}

// 写入结果需同时说明用户决定与最终影响，失败则明确区分为执行问题。
function huoquXieruJieguo(rawContent, isShouquanJieguo) {
  const content = String(rawContent ?? '').trim()
  if (/^(已拒绝|用户未授权)/u.test(content)) {
    return {
      tone: 'rejected',
      title: isShouquanJieguo ? '已拒绝授权' : '操作未执行',
      content: content.replace(/^(?:已拒绝[^，。]*(?:[，,]\s*)?|用户未授权[^。]*。?)/u, '').trim() || '本次操作未执行。',
    }
  }
  if (/(失败|未完成|未找到|不存在)/u.test(content)) {
    return { tone: 'failed', title: '操作未完成', content }
  }
  return { tone: 'completed', title: isShouquanJieguo ? '已允许操作' : '操作已完成', content }
}

function yinggaiXianshiChuliGuocheng(message) {
  return Boolean(message?.pending || message?.toolCalls?.length || message?.completedAt)
}

function yinggaiXianshiGongjuJilu(message) {
  return Boolean(message?.toolCalls?.length)
}

// 最后一段工具调用后的文本作为最终回复保留在摘要外，其余记录归入可展开的执行过程。
function huoquGongjuChuliKuai(message) {
  const blocks = huoquShixuKuai(message)
  const lastToolIndex = blocks.reduce((index, block, currentIndex) => block.type === 'tool' ? currentIndex : index, -1)
  const lastIndex = blocks.length - 1
  const isZuiZhongWenben = lastToolIndex >= 0 && lastIndex > lastToolIndex && blocks[lastIndex]?.type === 'text'
  return blocks.filter((block, index) => !['approval-result', 'operation-result'].includes(block.type) && !(isZuiZhongWenben && index === lastIndex))
}

function huoquGongjuJieguoKuai(message) {
  return huoquShixuKuai(message).filter((block) => ['approval-result', 'operation-result'].includes(block.type))
}

function huoquGongjuZuiZhongWenben(message) {
  const blocks = huoquShixuKuai(message)
  const lastToolIndex = blocks.reduce((index, block, currentIndex) => block.type === 'tool' ? currentIndex : index, -1)
  const lastIndex = blocks.length - 1
  const block = blocks[lastIndex]
  return lastToolIndex >= 0 && lastIndex > lastToolIndex && block?.type === 'text' ? block.content : ''
}

// 等待授权时仅保留授权卡，避免与当前助手的工具执行卡重复呈现同一项操作。
function yinggaiYincangShouquanQianXiaoxi(message, index) {
  return Boolean(
    ziliaokuShouquanQingqiu.value
    && message?.role === 'assistant'
    && message?.pending
    && index === messages.value.length - 1,
  )
}

function geshiChuliShijian(startedAt, completedAt = 0) {
  const start = Number(startedAt)
  if (!Number.isFinite(start) || start <= 0) return ''
  const end = Number(completedAt) || chuliJishiNow.value
  const milliseconds = Math.max(0, end - start)
  if (milliseconds < 1000) return '< 1 秒'
  if (milliseconds < 10000) return `${(milliseconds / 1000).toFixed(1)} 秒`
  return `${Math.round(milliseconds / 1000)} 秒`
}

function huoquChuliXiangqing(message) {
  const shijian = geshiChuliShijian(message?.startedAt, message?.completedAt)
  return shijian ? `${message?.pending ? '已用时' : '耗时'} ${shijian}` : ''
}

// 仅显示供应商返回的真实输出 token，避免把字符数或估算值当作消耗。
function huoquTokenXiaohao(message) {
  const outputTokens = Number(message?.outputTokens)
  if (!Number.isFinite(outputTokens) || outputTokens <= 0) return ''
  return `${Math.round(outputTokens).toLocaleString('zh-CN')} tokens`
}

function huoquToolZhuangtaiWenAn(tool) {
  // 文件生成工具在执行期间明确展示“生成中”，普通工具仍使用通用状态。
  if (tool?.status === 'running') {
    return ['create_docx_copy', 'create_xlsx_workbook', 'create_markdown_file', 'create_pdf_document'].includes(tool?.name)
      ? '生成中'
      : '进行中'
  }
  if (tool?.status === 'failed') return '未完成'
  return tool?.count > 1 ? `已执行 ${tool.count} 次` : '已完成'
}

// 授权卡只保留用户可判断的信息，内部条目 ID 不干扰阅读。
function huoquShouquanMingxi(request) {
  return String(request?.detail ?? '')
    .split('\n')
    .map((detail) => detail.replace(/^•\s*/u, '').trim())
    .filter((detail) => detail && !detail.startsWith('条目 ID：'))
}

function huoquShouquanBiaoti(request) {
  return String(request?.title ?? '确认操作')
    .replace(/^允许/u, '')
    .replace(/[？?]$/u, '')
}

const currentModel = computed(() => status.value?.current ?? null)
const tuiliQiangduList = computed(() => currentModel.value?.thinkingLevels ?? [])
const aiZhushouShiyongWendangHtml = computed(() => xuanzaiMarkdown(aiZhushouShiyongWendang))
const shiyongWendangShili = [
  { title: '整理会议记录', prompt: '把下面的会议记录整理成待办事项，并标注负责人和截止时间：' },
  { title: '查找本地资料', prompt: '资料库里有哪些和产品设计有关的文档？请按相关性列出。' },
  { title: '查询最新信息', prompt: '帮我搜索今天的 AI 行业新闻，并附上来源链接。' },
  { title: '保存一份结果', prompt: '把这份总结保存到收集箱，标题叫“竞品调研要点”。' },
]
const currentModelName = computed(() => (isStatusLoading.value ? '正在准备' : currentModel.value ? currentModel.value.name : '未配置模型'))
const sousuoLaiYuanMingcheng = computed(() => (searchProvider.value === 'anysearch' ? 'AnySearch' : '必应'))
const huanyingYuanwen = computed(() => (isStatusLoading.value ? '正在准备助手…' : currentModel.value ? '有什么可以帮你?' : '配置模型后开始对话'))
const huanyingYiShuru = ref('')
const isHuanyingDaziWancheng = ref(false)
let huanyingDaziTimer = 0

// 欢迎语逐字显示，完成后再显示持续闪烁的光标。
function kaishiHuanyingDazi(text) {
  window.clearTimeout(huanyingDaziTimer)
  huanyingYiShuru.value = ''
  isHuanyingDaziWancheng.value = false

  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
    huanyingYiShuru.value = text
    isHuanyingDaziWancheng.value = true
    return
  }

  const zifuList = [...text]
  let currentIndex = 0
  const shuruXiaYiGeZifu = () => {
    huanyingYiShuru.value += zifuList[currentIndex]
    currentIndex += 1
    if (currentIndex >= zifuList.length) {
      isHuanyingDaziWancheng.value = true
      return
    }
    huanyingDaziTimer = window.setTimeout(shuruXiaYiGeZifu, 68)
  }
  huanyingDaziTimer = window.setTimeout(shuruXiaYiGeZifu, 160)
}

const huihuaFenZu = computed(() => {
  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const weekStart = todayStart - 6 * 24 * 60 * 60 * 1000
  const groups = [
    { label: '今天', items: [] },
    { label: '最近 7 天', items: [] },
    { label: '更早', items: [] },
  ]
  for (const conversation of conversations.value) {
    const updatedAt = Number(conversation.updatedAt) || 0
    const group = updatedAt >= todayStart ? groups[0] : updatedAt >= weekStart ? groups[1] : groups[2]
    group.items.push(conversation)
  }
  return groups.filter((group) => group.items.length)
})
const customLuJingPlaceholder = computed(() => (
  customXieyi.value === 'anthropic'
    ? 'https://… 或 …/v1/messages'
    : 'https://…/v1 或 …/chat/completions'
))
const customMoxingPlaceholder = computed(() => (
  customXieyi.value === 'anthropic'
    ? '自动识别失败时填写，例如 claude-sonnet-4-20250514'
    : '自动识别失败时填写，例如 deepseek-chat'
))
const currentSelectedProvider = computed(() => (
  status.value?.keyProviders?.find((item) => item.id === selectedProvider.value) ?? null
))
// 内置与自定义供应商的后续操作不同，选择器分组展示以减少误操作。
const neizhiProviderList = computed(() => (status.value?.keyProviders ?? []).filter((provider) => !provider.custom))
const zidingyiProviderList = computed(() => (status.value?.keyProviders ?? []).filter((provider) => provider.custom))
const modelGroups = computed(() => {
  const groups = new Map()
  for (const model of status.value?.models ?? []) {
    if (!groups.has(model.provider)) groups.set(model.provider, { provider: model.provider, name: model.providerName ?? model.provider, models: [] })
    groups.get(model.provider).models.push(model)
  }
  return [...groups.values()]
})
const visibleModelGroups = computed(() => {
  const keyword = moxingKeyword.value.trim().toLowerCase()
  return modelGroups.value
    .map((group) => {
      const matchedModels = keyword
        ? group.models.filter((model) => `${model.name} ${model.id}`.toLowerCase().includes(keyword))
        : group.models
      const shownCount = moxingZhanshiCount.value[group.provider] ?? modelBatchSize
      return {
        ...group,
        models: matchedModels.slice(0, shownCount),
        matchedCount: matchedModels.length,
        remainingCount: Math.max(0, matchedModels.length - shownCount),
      }
    })
    .filter((group) => group.models.length)
})
const moxingMatchCount = computed(() => (
  visibleModelGroups.value.reduce((count, group) => count + group.matchedCount, 0)
))
const currentModelProviderName = computed(() => {
  const provider = modelGroups.value.find((group) => group.provider === currentModel.value?.provider)
  return provider?.name ?? currentModel.value?.provider ?? ''
})
const selectedProviderName = computed(() => {
  const provider = status.value?.keyProviders?.find((item) => item.id === selectedProvider.value)
  return provider?.name ?? '选择供应商'
})
const isXianshiZuihouXiaoxi = computed(() => messages.value.length && !isJinZuihou.value)

// 仅在用户停留在底部附近时跟随流式回复，避免阅读历史内容时被强制拉回底部。
watch(messages, () => {
  if (scrollFrame || !isJinZuihou.value) return
  scrollFrame = requestAnimationFrame(async () => {
    scrollFrame = 0
    await nextTick()
    const layer = messagesLayer.value
    if (layer && isJinZuihou.value) layer.scrollTop = layer.scrollHeight
  })
}, { deep: true })

// 仅在生成期间刷新耗时，避免静态消息持续触发渲染。
watch(isBusy, (busy) => {
  if (chuliJishiTimer) window.clearInterval(chuliJishiTimer)
  if (!busy) return
  chuliJishiNow.value = Date.now()
  chuliJishiTimer = window.setInterval(() => {
    chuliJishiNow.value = Date.now()
  }, 250)
}, { immediate: true })

watch(huanyingYuanwen, kaishiHuanyingDazi, { immediate: true })

function chuliXiaoxiGunDong() {
  const layer = messagesLayer.value
  if (!layer) return
  const juliZuihou = layer.scrollHeight - layer.clientHeight - layer.scrollTop
  isJinZuihou.value = juliZuihou <= zuihouJuliYuzhi
}

// 输入框优先随文本增长，超过五行后再启用内部滚动，避免短内容过早显示滚动条。
function zhengliShuruKuangGaodu() {
  const textarea = shuruKuang.value
  if (!textarea) return
  const maxHeight = 128
  textarea.style.height = 'auto'
  textarea.style.height = `${Math.min(textarea.scrollHeight, maxHeight)}px`
  textarea.style.overflowY = textarea.scrollHeight > maxHeight ? 'auto' : 'hidden'
}

// 用户主动发送或点击入口时回到最新位置，恢复后续流式内容跟随。
async function gunDaoZuihou() {
  isJinZuihou.value = true
  await nextTick()
  const layer = messagesLayer.value
  layer?.scrollTo({ top: layer.scrollHeight, behavior: 'smooth' })
}

// 使用文档以内嵌面板展示，避免切出当前对话。
function dakaiShiyongWendang() {
  isDocumentationOpen.value = true
}

// 文档中的主操作直接打开供应商配置，避免用户返回后再次寻找入口。
function dakaiWendangPeizhi() {
  isDocumentationOpen.value = false
  dakaiGongyingshangConfig()
}

// 将示例带入输入框，让说明文档可以直接转化为一次可编辑的提问。
async function shiyongWendangShiliTianru(prompt) {
  draft.value = prompt
  isDocumentationOpen.value = false
  await nextTick()
  zhengliShuruKuangGaodu()
  shuruKuang.value?.focus()
}

onUnmounted(() => {
  if (scrollFrame) cancelAnimationFrame(scrollFrame)
  if (chuliJishiTimer) window.clearInterval(chuliJishiTimer)
  window.clearTimeout(huanyingDaziTimer)
})

// 自动填入的名称会随路径补全持续修正；用户手动改名后则保持原值。
watch(customUrl, () => {
  const tuidaoName = tuidaoMingcheng(customUrl.value)
  if (!customName.value.trim() || customName.value === zidingyiMingchengLastAuto) {
    customName.value = tuidaoName
  }
  zidingyiMingchengLastAuto = tuidaoName
  const xieyi = tuidaoCompatibleXieyi(customUrl.value)
  if (xieyi) customXieyi.value = xieyi
})

watch(moxingKeyword, () => {
  moxingZhanshiCount.value = {}
})

// 切换模型/供应商标签时关闭下拉菜单，避免菜单遗留在已切换的内容层上。
watch(configTab, () => {
  isProviderMenuOpen.value = false
})

function tuidaoMingcheng(rawUrl) {
  return tuidaoProviderName(rawUrl)
}

function zengjiaMoxingZhanshi(provider) {
  const count = moxingZhanshiCount.value[provider] ?? modelBatchSize
  moxingZhanshiCount.value = { ...moxingZhanshiCount.value, [provider]: count + modelBatchSize }
}

async function chushihua() {
  kaishiJianting()
  await jiazaiHuihua()
  await jiazaiStatus()
  await jiazaiSearchConfig()
  if (status.value?.keyProviders?.length) selectedProvider.value = status.value.keyProviders[0].id
  chuliProviderBianhua()
  tianchongAnySearchKeyMask()
}

// 首帧完成后再加载 Pi 运行时，避免首次进入助手页与主进程初始化争用界面响应。
function anpaiChushihua() {
  chushihuaZhen = window.requestAnimationFrame(() => {
    chushihuaZhen = 0
    chushihuaTimer = window.setTimeout(() => {
      chushihuaTimer = 0
      void chushihua()
    }, 0)
  })
}

// 未配置模型时打开配置面板，直接落在可执行下一步的供应商页。
function qiehuanConfigPanel() {
  const willOpen = !isConfigOpen.value
  if (willOpen && !status.value?.models?.length) configTab.value = 'provider'
  isConfigOpen.value = willOpen
  if (willOpen) isThinkingMenuOpen.value = false
}

// 外层空状态的引导入口，始终打开可直接完成配置的供应商页。
function dakaiGongyingshangConfig() {
  isProviderMenuOpen.value = false
  configTab.value = 'provider'
  isConfigOpen.value = true
  isThinkingMenuOpen.value = false
}

// 有密钥则显示打码，无密钥则为空；聚焦进入编辑态，失焦未保存则还原。
function tianchongMask() {
  if (currentSelectedProvider.value?.configured) {
    apiKey.value = currentSelectedProvider.value.apiKeyMask || keyMask
    keyInputType.value = 'text'
  } else {
    apiKey.value = ''
    keyInputType.value = 'password'
  }
}

function chuliProviderBianhua() {
  tianchongMask()
}

function chuliApiKeyFocus() {
  if (keyInputType.value === 'text') {
    apiKey.value = ''
    keyInputType.value = 'password'
  }
}

function chuliApiKeyBlur() {
  tianchongMask()
}

// AnySearch 密钥沿用供应商密钥的打码交互：已配置显示掩码，聚焦进入编辑态。
function tianchongAnySearchKeyMask() {
  if (isAnySearchKeyConfigured.value) {
    anysearchKey.value = anysearchKeyMask.value || keyMask
    anysearchKeyInputType.value = 'text'
  } else {
    anysearchKey.value = ''
    anysearchKeyInputType.value = 'password'
  }
}

function chuliAnySearchKeyFocus() {
  if (anysearchKeyInputType.value === 'text') {
    anysearchKey.value = ''
    anysearchKeyInputType.value = 'password'
  }
}

function chuliAnySearchKeyBlur() {
  tianchongAnySearchKeyMask()
}

// 切换搜索来源即时持久化，切换失败由状态提示反馈。
async function qiehuanSearchSource(provider) {
  if (isSavingSearchKey.value || provider === searchProvider.value) return
  await shezhiSearchProvider(provider)
}

// 保存 AnySearch 密钥，掩码未变化时跳过。
async function tijiaoAnySearchKey() {
  const value = anysearchKey.value.trim()
  if (isAnySearchKeyConfigured.value && value === (anysearchKeyMask.value || keyMask)) return
  const chenggong = await baocunAnySearchApiKey(value)
  if (chenggong) tianchongAnySearchKeyMask()
}

// 清除时提交空密钥，主进程据此移除存储。
async function qingchuAnySearchKey() {
  if (isSavingSearchKey.value) return
  const chenggong = await baocunAnySearchApiKey('')
  if (chenggong) tianchongAnySearchKeyMask()
}

// 打开 AnySearch 官方配额与价格说明页。
function dakaiAnySearchGuize() {
  window.aetherDock?.openExternalUrl(ANYSEARCH_GUIZE_URL)
}

// 自定义选择菜单沿用原有供应商状态和密钥预填逻辑。
function qiehuanProvider(providerId) {
  if (!providerId || isSavingKey.value) return
  selectedProvider.value = providerId
  isProviderMenuOpen.value = false
  chuliProviderBianhua()
}

async function baocunProviderKey() {
  const provider = selectedProvider.value || status.value?.keyProviders?.[0]?.id
  const value = apiKey.value.trim()
  if (!provider || !value) return
  if (currentSelectedProvider.value?.configured && value === (currentSelectedProvider.value.apiKeyMask || keyMask)) return
  const chenggong = await shezhiProviderKey(provider, value)
  if (chenggong) {
    tianchongMask()
    configTab.value = 'model'
  }
}

// 清理前交由应用壳层统一二次确认，避免在配置页误触造成密钥丢失。
function qingqiuGongyingshangQingli() {
  if (!currentSelectedProvider.value || isSavingKey.value || isRemovingProvider.value || isBusy.value) return
  emit('request-provider-cleanup', currentSelectedProvider.value)
}

// 确认后按供应商类型清理，并将选择器同步到仍可用的供应商。
async function zhixingGongyingshangQingli() {
  const provider = currentSelectedProvider.value
  if (!provider) return false
  const chenggong = await qingliProvider(provider)
  if (!chenggong) return false
  selectedProvider.value = status.value?.keyProviders?.[0]?.id ?? ''
  isProviderMenuOpen.value = false
  chuliProviderBianhua()
  if (!status.value?.models?.length) configTab.value = 'provider'
  return true
}

// 自定义供应商：填路径 + 密钥后自动识别可用模型并接入。
async function tianjiaCustomProvider() {
  if (isAddingProvider.value) return
  isAddingProvider.value = true
  try {
    const result = await addProvider({
      name: customName.value.trim(),
      baseUrl: customUrl.value.trim(),
      modelId: customModelId.value.trim(),
      xieyi: customXieyi.value,
      apiKey: customKey.value.trim(),
    })
    if (result?.chenggong) {
      customName.value = ''
      customUrl.value = ''
      customModelId.value = ''
      customXieyi.value = 'openai'
      customKey.value = ''
      zidingyiMingchengLastAuto = ''
      configTab.value = 'model'
    }
  } finally {
    isAddingProvider.value = false
  }
}

function tijiaoXiaoxi() {
  const text = draft.value.trim()
  if (!currentModel.value || !text || isBusy.value) return
  draft.value = ''
  void nextTick(zhengliShuruKuangGaodu)
  faSong(text)
  gunDaoZuihou()
}

// 删除确认交给应用内弹窗，避免原生确认框触发窗口失焦后自动收起。
function qingqiuShanchuHuihua(conversation) {
  if (!conversation || isBusy.value || isConversationLoading.value) return
  emit('request-conversation-delete', conversation)
}

function zhixingHuihuaShanchu(conversationId) {
  return shanchuHuihua(conversationId)
}

function isCurrentModel(model) {
  return model.provider === currentModel.value?.provider && model.id === currentModel.value?.id
}

function huoquTuiliQiangduMingcheng(level) {
  return ({ off: '关闭', minimal: '极低', low: '低', medium: '中', high: '高', xhigh: '很高', max: '最高' })[level] ?? level
}

// 点击推理菜单外的任意区域时收起菜单，避免浮层残留。
function guanbiTuiliCaidan() {
  isThinkingMenuOpen.value = false
}

// 切换模型期间锁定列表，避免连续点击造成状态错乱。
async function qiehuanModel(model) {
  if (!model || isSwitchingModel.value || isCurrentModel(model)) return
  isSwitchingModel.value = true
  try {
    await xuanzeModel(model.provider, model.id)
  } finally {
    isSwitchingModel.value = false
  }
}

// 推理强度切换期间锁定选项，避免连续点击产生竞态。
async function qiehuanTuiliQiangdu(level) {
  if (!level || isBusy.value || isSwitchingThinking.value || level === currentModel.value?.thinkingLevel) return
  isSwitchingThinking.value = true
  try {
    if (await shezhiTuiliQiangdu(level)) isThinkingMenuOpen.value = false
  } finally {
    isSwitchingThinking.value = false
  }
}

defineExpose({ zhixingGongyingshangQingli, zhixingHuihuaShanchu })

onMounted(anpaiChushihua)
onUnmounted(() => {
  if (chushihuaZhen) window.cancelAnimationFrame(chushihuaZhen)
  if (chushihuaTimer) window.clearTimeout(chushihuaTimer)
})
</script>

<style scoped>
.assistant-page {
  /* 参考 Pi 的正文、标题与命令三级字体层级，并为中文保留本地回退。 */
  --assistant-font-sans: var(--font-ui);
  --assistant-font-reading: var(--font-reading);
  --assistant-font-mono: var(--font-code);
  --font-display: var(--assistant-font-sans);
  --font-body: var(--assistant-font-reading);
  --font-mono: var(--assistant-font-mono);
  position: absolute;
  z-index: 2;
  inset: 0;
  display: flex;
  overflow: hidden;
  flex-direction: column;
  border-radius: 18px;
  background: #eef1eb;
  color: var(--ink);
  color-scheme: light;
  font-family: var(--assistant-font-reading);
}

.assistant-topbar {
  display: flex;
  min-height: 64px;
  flex: 0 0 64px;
  align-items: center;
  gap: 10px;
  padding: 0 16px;
  border-bottom: 1px solid rgba(255, 255, 255, .1);
  background: #202420;
}

.assistant-back,
.assistant-action {
  display: inline-flex;
  width: 32px;
  height: 32px;
  flex: 0 0 32px;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(255, 255, 255, .13);
  border-radius: 10px;
  background: rgba(255, 255, 255, .06);
  color: rgba(255, 255, 255, .72);
  cursor: pointer;
  transition: border-color 150ms ease, background 150ms ease, color 150ms ease, transform 150ms var(--motion-easing);
}

.assistant-back:hover,
.assistant-action:hover {
  border-color: rgba(186, 255, 141, .48);
  background: rgba(186, 255, 141, .1);
  color: #c7ff9c;
  transform: translateY(-1px);
}

/* 配置面板展开时保持按钮的选中反馈，明确当前操作状态。 */
.assistant-action--active {
  border-color: rgba(186, 255, 141, .6);
  background: rgba(186, 255, 141, .16);
  color: #c7ff9c;
  box-shadow: inset 0 0 0 1px rgba(186, 255, 141, .12);
}
.assistant-action--active:hover { background: rgba(186, 255, 141, .2); }

.assistant-identity { display: flex; min-width: 0; flex: 1; align-items: center; gap: 6px; }
/* 收紧吉祥物素材的横向透明留白，使可见图形与标题保持视觉对齐。 */
.assistant-identity-icon { display: block; width: 28px; height: 36px; flex: 0 0 28px; object-fit: cover; object-position: center; }
.assistant-heading { display: grid; min-width: 0; min-height: 36px; align-content: center; gap: 3px; transform: translateY(2px); }
.assistant-heading strong { color: #f7faf3; font: 800 14px/1.15 var(--font-display); letter-spacing: .02em; }

.assistant-config-panel {
  --font-body: var(--assistant-font-sans);
  position: absolute;
  z-index: 3;
  inset: 64px 0 0;
  display: grid;
  gap: 7px;
  align-content: start;
  max-height: none;
  padding: 9px 16px 11px;
  overflow: auto;
  overscroll-behavior: contain;
  border-bottom: 1px solid rgba(32, 36, 32, .12);
  background: #f7f9f4;
}

.assistant-config-tabs {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 4px;
  padding: 3px;
  border: 1px solid rgba(32, 36, 32, .12);
  border-radius: 11px;
  background: #e9ede5;
}
.assistant-config-tabs button {
  height: 29px;
  border: none;
  border-radius: 7px;
  background: transparent;
  color: #687168;
  cursor: pointer;
  font: 600 11px var(--font-body);
  letter-spacing: .04em;
  transition: background 150ms ease, color 150ms ease, box-shadow 150ms ease;
}
.assistant-config-tabs button.is-active {
  background: #202420;
  box-shadow: none;
  color: #eff8e9;
}
.assistant-config-tabs button:disabled { cursor: not-allowed; opacity: .46; }

.assistant-config-view { display: grid; gap: 7px; }

.assistant-config-sub {
  display: grid;
  gap: 7px;
  padding: 10px 11px;
  border: 1px solid rgba(32, 36, 32, .1);
  border-radius: 12px;
  background: rgba(255, 255, 255, .74);
}
.assistant-config-subtitle { color: #667068; font: 650 10px var(--font-body); letter-spacing: .04em; }

.assistant-config-row { display: grid; grid-template-columns: minmax(0, 160px) minmax(0, 1fr); gap: 10px; }
.assistant-field { display: grid; gap: 4px; }
.assistant-field > span { color: #687168; font: 650 10px var(--font-body); letter-spacing: .04em; }

/* 说明 AnySearch 填 Key 与匿名的额度差异，弱化呈现避免干扰主操作。 */
.assistant-search-note { margin: 1px 0 2px; color: #7c867d; font: 500 10px/1.5 var(--font-body); }

.assistant-configured { margin: 0; color: var(--ink-muted); font: 600 11px var(--font-body); }
.assistant-configured--empty { color: var(--ink-faint); }
.assistant-configured--error { color: #9a4d42; }

/* 模型选择区以文字层级展示状态，避免状态色喧宾夺主。 */
.assistant-model-manager { display: grid; gap: 7px; }
.assistant-current-model {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 9px;
  padding: 7px 9px;
  border: 1px solid rgba(32, 36, 32, .13);
  border-radius: 10px;
  background: rgba(255, 255, 255, .76);
}
.assistant-current-model-dot {
  width: 7px;
  height: 7px;
  flex: 0 0 7px;
  border-radius: 50%;
  background: #397b32;
}
.assistant-current-model-copy { display: grid; min-width: 0; flex: 1; gap: 0; }
.assistant-section-label { color: #788278; font: 650 8px/1.2 var(--font-body); letter-spacing: .08em; }
.assistant-current-model-copy strong,
.assistant-model-option-copy strong { overflow: hidden; color: var(--ink); font: 650 11px/1.25 var(--font-body); text-overflow: ellipsis; white-space: nowrap; }
.assistant-current-model-copy small,
.assistant-model-option-copy small { overflow: hidden; color: var(--ink-faint); font: 500 9px/1.2 var(--font-mono); text-overflow: ellipsis; white-space: nowrap; }
.assistant-current-model-state {
  flex: 0 0 auto;
  color: #397b32;
  font: 650 8px var(--font-body);
  letter-spacing: .03em;
}
.assistant-model-list { display: grid; gap: 4px; }
.assistant-model-filter { margin: 2px 0; }
.assistant-model-list-heading,
.assistant-provider-group-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}
.assistant-model-list-heading > span:last-child,
.assistant-provider-group-heading > span:last-child { color: #7b877c; font: 500 9px var(--font-mono); }
.assistant-provider-group { display: grid; gap: 3px; }
.assistant-provider-group-heading > span:first-child { color: #414a42; font: 700 10px var(--font-body); }
.assistant-model-options {
  display: grid;
  grid-template-columns: 1fr;
  overflow: hidden;
  border: 1px solid rgba(32, 36, 32, .12);
  border-radius: 10px;
  background: #fff;
}
.assistant-model-option {
  display: flex;
  min-width: 0;
  min-height: 35px;
  align-items: center;
  gap: 8px;
  padding: 5px 8px;
  border: none;
  border-radius: 0;
  background: transparent;
  color: var(--ink);
  cursor: pointer;
  text-align: left;
  transition: border-color 150ms ease, background 150ms ease, transform 150ms var(--motion-easing);
}
.assistant-model-option + .assistant-model-option { border-top: 1px solid rgba(32, 36, 32, .1); }
.assistant-model-option:hover:not(:disabled) { background: #f5f8f2; transform: none; }
.assistant-model-option:active:not(:disabled) { transform: translateY(0); }
.assistant-model-option:focus-visible { outline: 2px solid rgba(61, 132, 48, .55); outline-offset: 2px; }
.assistant-model-option--current { box-shadow: inset 2px 0 #4c9b42; background: #f2f8ee; cursor: default; }
.assistant-model-option:disabled:not(.assistant-model-option--current) { cursor: wait; opacity: .55; }
.assistant-model-option-copy { display: grid; min-width: 0; flex: 1; gap: 2px; }
.assistant-model-option-current,
.assistant-model-option-action { display: inline-flex; flex: 0 0 auto; align-items: center; gap: 3px; color: #397b32; font: 650 9px var(--font-body); white-space: nowrap; }
.assistant-model-option-action { color: #718073; }
.assistant-model-more {
  justify-self: start;
  padding: 4px 7px;
  border: 1px solid rgba(32, 36, 32, .14);
  border-radius: 7px;
  background: rgba(255, 255, 255, .72);
  color: #687168;
  cursor: pointer;
  font: 600 9px var(--font-body);
}
.assistant-model-more:hover { border-color: rgba(74, 121, 62, .42); color: #397b32; }

.assistant-field input {
  width: 100%;
  height: 33px;
  padding: 0 9px;
  border: 1px solid rgba(32, 36, 32, .16);
  border-radius: 9px;
  background: #fff;
  color: var(--ink);
  font: 600 11px var(--font-body);
}
.assistant-field input { font-family: var(--font-mono); }
.assistant-provider-picker { position: relative; }
.assistant-provider-trigger {
  display: flex;
  width: 100%;
  height: 33px;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 0 9px;
  overflow: hidden;
  border: 1px solid rgba(32, 36, 32, .16);
  border-radius: 9px;
  background: #fff;
  color: var(--ink);
  cursor: pointer;
  font: 600 11px var(--font-body);
  text-align: left;
  transition: border-color 150ms ease, background 150ms ease, color 150ms ease;
}
.assistant-provider-trigger > span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.assistant-provider-trigger > svg { flex: 0 0 auto; color: #677268; transition: transform 150ms var(--motion-easing); }
.assistant-provider-trigger[aria-expanded="true"] { border-color: rgba(74, 121, 62, .62); background: #f8fcf5; }
.assistant-provider-trigger[aria-expanded="true"] > svg { transform: rotate(180deg); }
.assistant-provider-trigger:disabled { cursor: wait; opacity: .55; }
.assistant-provider-menu {
  position: absolute;
  z-index: 5;
  top: calc(100% + 5px);
  right: 0;
  left: 0;
  display: grid;
  max-height: 154px;
  padding: 4px;
  overflow: auto;
  border: 1px solid rgba(32, 36, 32, .16);
  border-radius: 10px;
  background: #fff;
  box-shadow: 0 10px 24px rgba(36, 49, 37, .14);
  scrollbar-color: rgba(82, 96, 83, .52) transparent;
  scrollbar-width: thin;
}
.assistant-provider-option {
  display: flex;
  min-height: 30px;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 0 7px;
  border: none;
  border-radius: 7px;
  background: transparent;
  color: #465046;
  cursor: pointer;
  font: 600 10px var(--font-body);
  text-align: left;
  transition: background 120ms ease, color 120ms ease;
}
.assistant-provider-option:hover { background: #f0f6ec; color: #2f6130; }
.assistant-provider-option:focus-visible { outline: 2px solid rgba(74, 121, 62, .55); outline-offset: -1px; }
.assistant-provider-option--selected { background: #eaf5e3; color: #397b32; }
.assistant-provider-menu::-webkit-scrollbar { width: 6px; }
.assistant-provider-menu::-webkit-scrollbar-track { background: transparent; }
.assistant-provider-menu::-webkit-scrollbar-thumb { border: 2px solid transparent; border-radius: 999px; background: rgba(82, 96, 83, .5); background-clip: padding-box; }
.assistant-provider-menu::-webkit-scrollbar-button { display: none; width: 0; height: 0; }
.assistant-provider-group + .assistant-provider-group { margin-top: 4px; padding-top: 4px; border-top: 1px solid rgba(32, 36, 32, .1); }
.assistant-provider-group-label { margin: 3px 7px 4px; color: #758075; font: 700 9px var(--font-body); letter-spacing: .06em; }
.assistant-field input:focus,
.assistant-provider-trigger:focus-visible {
  border-color: rgba(74, 121, 62, .62);
  outline: 2px solid rgba(186, 255, 141, .48);
  outline-offset: 1px;
}
.assistant-save {
  width: fit-content;
  padding: 7px 12px;
  border: 1px solid #202420;
  border-radius: 9px;
  background: #202420;
  color: #f4f8f0;
  cursor: pointer;
  font: 600 11px var(--font-body);
}
.assistant-save:hover { background: #353d35; color: #fff; }
.assistant-save:disabled { cursor: wait; opacity: .55; }
.assistant-save--primary { border-color: #202420; background: #202420; color: #c7ff9c; }
.assistant-save--primary:hover { background: #353d35; color: #d8ffc0; }

.assistant-messages {
  display: flex;
  min-height: 0;
  flex: 1;
  flex-direction: column;
  gap: 12px;
  padding: 18px 20px;
  overflow: auto;
  overscroll-behavior: contain;
}

.assistant-empty { display: grid; width: min(100%, 460px); align-content: center; gap: 15px; margin: auto; padding: 18px 6px; }
.assistant-empty-intro { display: flex; align-items: flex-start; gap: 13px; }
.assistant-empty-copy { display: grid; gap: 4px; padding-top: 2px; }
.assistant-empty strong { color: #202420; font: 800 16px/1.3 var(--font-display); letter-spacing: .01em; }
.assistant-bubble { display: flex; max-width: min(100%, 620px); align-items: flex-start; gap: 8px; }
.assistant-bubble--user { justify-content: flex-end; }
.assistant-bubble--assistant { justify-content: flex-start; }
.assistant-message-avatar { display: block; width: 27px; height: 27px; flex: 0 0 27px; object-fit: contain; }
.assistant-message-avatar--user { order: 2; }
.assistant-bubble-inner {
  max-width: calc(100% - 33px);
  padding: 9px 12px;
  border: 1px solid rgba(32, 36, 32, .11);
  border-radius: 5px 14px 14px 14px;
  background: rgba(255, 255, 255, .76);
  box-shadow: inset 0 1px rgba(255, 255, 255, .82);
}
.assistant-bubble--user .assistant-bubble-inner {
  max-width: 82%;
  border-color: #202420;
  border-radius: 14px 5px 14px 14px;
  background: #202420;
  color: #f4f8f0;
}
.assistant-bubble-inner p { margin: 0; color: #3d463e; font: 12px/1.65 var(--font-body); overflow-wrap: anywhere; white-space: pre-wrap; }
.assistant-bubble--user .assistant-bubble-inner p { color: #f4f8f0; }

/* 资料库授权卡以对话延伸的方式呈现，信息优先于装饰。 */
.assistant-library-approval {
  display: grid;
  width: min(100%, 430px);
  gap: 9px;
  padding: 12px 13px 11px;
  border: 1px solid rgba(44, 65, 47, .17);
  border-left: 3px solid #a87c35;
  border-radius: 12px;
  background: rgba(255, 255, 255, .82);
  box-shadow: 0 5px 16px rgba(39, 64, 42, .06), inset 0 1px rgba(255, 255, 255, .86);
}
.assistant-library-approval--danger { border-color: rgba(133, 69, 60, .2); border-left-color: #ad6258; }
.assistant-library-approval-head { display: flex; align-items: center; gap: 7px; }
.assistant-library-approval-icon { display: grid; width: 22px; height: 22px; place-items: center; border: 1px solid rgba(152, 112, 46, .24); border-radius: 7px; background: #fff7e8; color: #96702f; }
.assistant-library-approval--danger .assistant-library-approval-icon { border-color: rgba(173, 98, 88, .2); background: #fff0ed; color: #a34f46; }
.assistant-library-approval-head div { display: grid; gap: 2px; }
.assistant-library-approval-head strong { color: #2c392d; font: 750 12px/1.25 var(--assistant-font-sans); }
.assistant-library-approval-head small { color: #8e7650; font: 700 9px/1.25 var(--assistant-font-sans); letter-spacing: .04em; }
.assistant-library-approval-message { margin: 1px 0 0; color: #49584b; font: 12px/1.5 var(--assistant-font-sans); }
.assistant-library-approval-detail { display: grid; gap: 4px; max-height: 92px; margin: 0; padding: 8px 0 0; overflow: auto; border-top: 1px solid rgba(44, 65, 47, .1); color: #657268; font: 10px/1.45 var(--assistant-font-sans); list-style: none; }
.assistant-library-approval-detail li { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.assistant-library-approval-actions { display: flex; flex-wrap: wrap; align-items: center; justify-content: flex-end; gap: 6px; padding-top: 2px; }
.assistant-library-approval-actions button { min-width: 72px; padding: 7px 10px; border-radius: 8px; cursor: pointer; font: 700 10px/1 var(--assistant-font-sans); transition: transform 150ms var(--motion-easing), background 150ms ease, border-color 150ms ease; white-space: nowrap; }
.assistant-library-approval-actions button:hover { transform: translateY(-1px); }
.assistant-library-approval-actions button:active { transform: translateY(0); }
.assistant-library-approval-reject { border: 1px solid rgba(44, 65, 47, .16); background: transparent; color: #69756a; }
.assistant-library-approval-reject:hover { border-color: rgba(44, 65, 47, .28); background: rgba(44, 65, 47, .04); color: #455246; }
.assistant-library-approval-allow { border: 1px solid #263d29; background: #263d29; color: #fff; }
.assistant-library-approval-allow:hover { border-color: #345d39; background: #345d39; }
.assistant-library-approval-always { border: 1px solid rgba(44, 65, 47, .22); background: #edf4ec; color: #38513b; }
.assistant-library-approval-always:hover { border-color: rgba(44, 65, 47, .38); background: #e2eee0; }
.assistant-library-approval--danger .assistant-library-approval-allow { border-color: #9d4e45; background: #9d4e45; }
.assistant-library-approval--danger .assistant-library-approval-allow:hover { border-color: #b75c50; background: #b75c50; }
.assistant-library-approval--danger .assistant-library-approval-always { border-color: rgba(157, 78, 69, .26); background: #fff0ed; color: #914a42; }
.assistant-library-approval--danger .assistant-library-approval-always:hover { border-color: rgba(157, 78, 69, .44); background: #fde4df; }
.assistant-library-approval-actions button:focus-visible { outline: 2px solid rgba(74, 121, 62, .42); outline-offset: 2px; }

/* 工具以独立的紧凑行呈现，完成后默认收起输入细节。 */
.assistant-tool-stream { display: grid; gap: 2px; margin: 0 0 10px; }
.assistant-tool-call { min-width: 0; color: #708072; font: 600 10px/1.45 var(--assistant-font-sans); }
.assistant-tool-call summary { display: grid; grid-template-columns: 8px minmax(0, 1fr) auto; align-items: center; gap: 6px; min-height: 25px; padding: 3px 0; cursor: pointer; list-style: none; }
.assistant-tool-call summary::-webkit-details-marker { display: none; }
.assistant-tool-call summary::before { width: 5px; height: 5px; border-radius: 50%; background: #6f9a72; content: ''; }
.assistant-tool-call--completed { color: #879087; }
.assistant-tool-call--completed summary::before { display: grid; width: 8px; height: 8px; place-items: center; border-radius: 0; background: transparent; color: #6f9a72; content: '✓'; font: 700 9px/1 var(--assistant-font-sans); }
.assistant-tool-call--running summary::before { animation: assistant-tool-call-pulse 1.1s ease-in-out infinite; }
.assistant-tool-call--failed { color: #9a5b51; }
.assistant-tool-call--failed summary::before { background: #b35d53; }
.assistant-tool-call-label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.assistant-tool-call small { flex: 0 0 auto; color: #929b93; font: 600 9px/1 var(--assistant-font-mono); }
.assistant-tool-call p { margin: 0 0 5px 14px; padding: 5px 8px; border-left: 1px solid rgb(72 91 74 / 14%); color: #7d887e; font: 500 9px/1.45 var(--assistant-font-mono); overflow-wrap: anywhere; }
@keyframes assistant-tool-call-pulse { 50% { opacity: .45; } }

.assistant-typing { display: inline-flex; gap: 3px; align-items: center; height: 16px; }
.assistant-typing i { width: 4px; height: 4px; border-radius: 50%; background: var(--ink-faint); animation: assistant-typing-dot 900ms ease-in-out infinite; }
.assistant-typing i:nth-child(2) { animation-delay: 150ms; }
.assistant-typing i:nth-child(3) { animation-delay: 300ms; }

@keyframes assistant-typing-dot {
  0%, 60%, 100% { opacity: .3; transform: translateY(0); }
  30% { opacity: 1; transform: translateY(-2px); }
}

.assistant-composer {
  --font-body: var(--assistant-font-mono);
  display: flex;
  gap: 9px;
  flex: 0 0 auto;
  align-items: flex-end;
  padding: 12px 16px 14px;
  border-top: 1px solid rgba(32, 36, 32, .12);
  background: #f7f9f4;
}

.assistant-composer textarea {
  min-height: 39px;
  max-height: 92px;
  flex: 1;
  padding: 9px 12px;
  resize: none;
  border: 1px solid rgba(32, 36, 32, .16);
  border-radius: 12px;
  background: #fff;
  color: #293129;
  font: 12px/1.5 var(--font-body);
}
.assistant-composer textarea::placeholder { color: #8a948a; }
.assistant-composer textarea:focus { border-color: rgba(74, 121, 62, .65); outline: 2px solid rgba(186, 255, 141, .5); outline-offset: 1px; }
.assistant-composer textarea:disabled { background: #f0f3ed; color: #929b92; cursor: not-allowed; }

.assistant-send {
  display: grid;
  width: 39px;
  height: 39px;
  flex: 0 0 39px;
  place-items: center;
  border: 1px solid #202420;
  border-radius: 12px;
  background: #202420;
  color: #c7ff9c;
  cursor: pointer;
  transition: background 150ms ease, color 150ms ease, transform 150ms var(--motion-easing);
}
.assistant-send:hover:not(:disabled) { background: #353d35; color: #e0ffc9; }
.assistant-send:active:not(:disabled) { transform: scale(.95) translateY(1px); }
.assistant-send:disabled { cursor: not-allowed; opacity: .45; }
.assistant-send--stop { border-color: #aa4e4e; background: #f9e5e2; color: #a14343; }

.assistant-config-enter-active, .assistant-config-leave-active { transition: opacity 160ms ease, transform 180ms var(--motion-easing); }
.assistant-config-enter-from, .assistant-config-leave-to { opacity: 0; transform: translateY(-6px); }

/* 滚动条保留可发现性，但不抢占模型与对话内容的注意力。 */
.assistant-config-panel,
.assistant-messages {
  scrollbar-color: rgba(82, 96, 83, .52) transparent;
  scrollbar-width: thin;
}
.assistant-config-panel::-webkit-scrollbar,
.assistant-messages::-webkit-scrollbar { width: 6px; height: 6px; }
.assistant-config-panel::-webkit-scrollbar-button,
.assistant-messages::-webkit-scrollbar-button { display: none; width: 0; height: 0; }
.assistant-config-panel::-webkit-scrollbar-track,
.assistant-messages::-webkit-scrollbar-track { background: transparent; }
.assistant-config-panel::-webkit-scrollbar-thumb,
.assistant-messages::-webkit-scrollbar-thumb {
  border: 2px solid transparent;
  border-radius: 999px;
  background: rgba(82, 96, 83, .5);
  background-clip: padding-box;
}
.assistant-config-panel::-webkit-scrollbar-thumb:hover,
.assistant-messages::-webkit-scrollbar-thumb:hover { background-color: rgba(57, 72, 58, .72); }

@media (max-width: 520px) {
  .assistant-topbar,
  .assistant-config-panel,
  .assistant-composer { padding-right: 12px; padding-left: 12px; }
  .assistant-messages { padding: 14px 12px; }
  .assistant-config-row { grid-template-columns: 1fr; gap: 7px; }
  .assistant-model-options { grid-template-columns: 1fr; }
}

@media (prefers-reduced-motion: reduce) {
  .assistant-typing i { animation: none; opacity: .55; }
}
</style>

<style scoped>
/* AI 页面保留轻纸张质感，并复用主界面的中性灰与荧光绿。 */
.assistant-page {
  --assistant-paper: #fafafa;
  --assistant-paper-deep: #f0f0f0;
  --assistant-paper-white: #fbfcfa;
  --assistant-titlebar-paper: #ececec;
  --assistant-sidebar-paper: var(--assistant-titlebar-paper);
  --assistant-sidebar-width: 216px;
  --assistant-graphite: var(--ink);
  --assistant-pencil: #657067;
  --assistant-faint: #929b93;
  --assistant-accent: var(--accent);
  --assistant-accent-soft: rgba(99, 254, 19, .13);
  --font-display: var(--assistant-font-sans);
  --font-body: var(--assistant-font-sans);
  --font-mono: var(--assistant-font-mono);
  isolation: isolate;
  border-radius: 18px;
  background-color: var(--assistant-paper);
  background-image: linear-gradient(112deg, rgb(255 255 255 / 58%), transparent 44%);
  color: var(--assistant-graphite);
  font-family: var(--assistant-font-sans);
}

/* 纸张压印覆盖在画布上，不拦截任何交互。 */
.assistant-page::before {
  position: absolute;
  z-index: -1;
  inset: 0;
  background: linear-gradient(105deg, rgb(255 255 255 / 36%), transparent 38%, rgb(56 61 56 / 3%));
  content: '';
  pointer-events: none;
}

.assistant-topbar {
  position: relative;
  min-height: 60px;
  flex-basis: 60px;
  gap: 11px;
  padding: 0 17px;
  border-bottom: 1px solid var(--border-ink);
  background: var(--assistant-titlebar-paper);
  box-shadow: 0 4px 14px rgb(15 17 16 / 6%);
}

/* 会话列表保持简洁分组，当前对话和新建入口一眼可辨。 */
.assistant-conversation-layout { position: relative; display: flex; min-height: 0; flex: 1; }
.assistant-conversation-sidebar {
  display: flex;
  width: var(--assistant-sidebar-width);
  flex: 0 0 var(--assistant-sidebar-width);
  flex-direction: column;
  gap: 10px;
  padding: 14px 10px 12px;
  border-right: 1px solid var(--border-ink);
  background: var(--assistant-sidebar-paper);
  overflow: hidden;
  transition: width 220ms var(--motion-easing), flex-basis 220ms var(--motion-easing), padding 220ms var(--motion-easing), border-color 160ms ease, opacity 160ms ease;
}
/* 收起时保留节点以维持会话滚动位置，视觉上平滑退出。 */
.assistant-conversation-sidebar--collapsed {
  width: 0;
  flex-basis: 0;
  padding-right: 0;
  padding-left: 0;
  border-right-color: transparent;
  opacity: 0;
  pointer-events: none;
}
.assistant-conversation-header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  padding: 0 5px;
}
.assistant-conversation-header span {
  color: var(--assistant-graphite);
  font: 750 12px/1 var(--assistant-font-sans);
}
.assistant-conversation-header small {
  color: var(--assistant-faint);
  font: 650 10px/1 var(--assistant-font-mono);
}
.assistant-new-conversation {
  display: inline-flex;
  min-height: 34px;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 0 9px;
  border: 1px solid #29312a;
  border-radius: 9px;
  background: #29312a;
  color: #f7faf3;
  cursor: pointer;
  font: 700 10px/1 var(--assistant-font-sans);
  transition: background 140ms ease, border-color 140ms ease, transform 140ms var(--motion-easing);
}
.assistant-new-conversation:hover:not(:disabled) { border-color: #3a5139; background: #3a5139; }
.assistant-new-conversation:active:not(:disabled) { transform: scale(.98); }
.assistant-new-conversation:disabled { cursor: wait; opacity: .5; }
/* 会话列表使用细窄圆角滚动条，弱化系统默认箭头带来的割裂感。 */
.assistant-conversation-list {
  display: grid;
  min-height: 0;
  gap: 16px;
  overflow: auto;
  scrollbar-color: rgb(73 89 75 / 42%) transparent;
  scrollbar-width: thin;
}
.assistant-conversation-list::-webkit-scrollbar { width: 8px; }
.assistant-conversation-list::-webkit-scrollbar-track { margin-block: 4px; background: transparent; }
.assistant-conversation-list::-webkit-scrollbar-thumb {
  min-height: 36px;
  border: 2px solid transparent;
  border-radius: 999px;
  background: rgb(73 89 75 / 42%);
  background-clip: padding-box;
}
.assistant-conversation-list::-webkit-scrollbar-thumb:hover { background-color: rgb(54 70 57 / 62%); }
.assistant-conversation-list::-webkit-scrollbar-button { display: none; width: 0; height: 0; }
.assistant-conversation-group { display: grid; gap: 4px; }
.assistant-conversation-group h2 { margin: 0 6px 2px; color: var(--assistant-faint); font: 750 9px/1.3 var(--assistant-font-sans); letter-spacing: .08em; }
.assistant-conversation-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 26px;
  align-items: center;
  border: 1px solid transparent;
  border-radius: 8px;
}
.assistant-conversation-row:hover,
.assistant-conversation-row.is-active { background: #e1eadc; }
.assistant-conversation-row.is-active { border-color: rgb(62 101 57 / 13%); }
.assistant-conversation-item {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 7px;
  min-width: 0;
  min-height: 32px;
  padding: 0 12px;
  border: 0;
  background: transparent;
  color: var(--assistant-graphite);
  cursor: pointer;
  font: 600 10px/1.35 var(--assistant-font-sans);
  text-align: left;
}
.assistant-conversation-title { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
/* 当前会话生成时显示紧凑进度环，避免标题区发生布局跳动。 */
.assistant-conversation-loading {
  width: 11px;
  height: 11px;
  margin-right: 1px;
  border: 2px solid rgb(40 93 42 / 22%);
  border-top-color: #3c8642;
  border-radius: 50%;
  animation: assistant-conversation-spin .8s linear infinite;
}
.assistant-conversation-item:disabled { cursor: wait; }
.assistant-conversation-row.is-active .assistant-conversation-item { color: #285d2a; font-weight: 750; }
.assistant-conversation-delete {
  display: grid;
  width: 26px;
  height: 29px;
  place-items: center;
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: var(--assistant-faint);
  cursor: pointer;
  opacity: 0;
}
.assistant-conversation-row:hover .assistant-conversation-delete,
.assistant-conversation-row.is-active .assistant-conversation-delete:focus-visible { opacity: 1; }
.assistant-conversation-delete:hover:not(:disabled) { background: rgb(169 80 65 / 10%); color: #9a4d42; }
.assistant-conversation-delete:disabled { cursor: wait; }
@keyframes assistant-conversation-spin { to { transform: rotate(360deg); } }
.assistant-conversation-empty {
  margin: 2px 6px;
  color: var(--assistant-faint);
  font: 600 10px/1.5 var(--assistant-font-sans);
}
.assistant-conversation-toggle {
  position: absolute;
  z-index: 4;
  top: 50%;
  left: 0;
  display: grid;
  width: 22px;
  height: 42px;
  place-items: center;
  border: 1px solid var(--border-ink);
  border-radius: 0 9px 9px 0;
  background: var(--assistant-paper-white);
  box-shadow: 2px 3px 8px rgb(15 17 16 / 8%);
  color: var(--assistant-pencil);
  cursor: pointer;
  transform: translateY(-50%);
  transition: left 220ms var(--motion-easing), border-color 150ms ease, background 150ms ease, color 150ms ease, border-radius 220ms var(--motion-easing);
}
.assistant-conversation-toggle--open {
  left: calc(var(--assistant-sidebar-width) - 7px);
  border-radius: 9px;
}
.assistant-conversation-toggle-icon { transition: transform 220ms var(--motion-easing); }
.assistant-conversation-toggle-icon--open { transform: rotate(180deg); }
.assistant-conversation-toggle:hover {
  border-color: rgba(33, 140, 0, .5);
  background: #edf8e6;
  color: var(--assistant-graphite);
}
.assistant-conversation-toggle:focus-visible {
  outline: 2px solid var(--assistant-accent);
  outline-offset: 2px;
}
.assistant-chat-pane { position: relative; display: flex; min-width: 0; flex: 1; flex-direction: column; }

/* 工具按钮与资料库操作保持一致的圆角与轻阴影。 */
.assistant-back,
.assistant-action {
  width: 34px;
  height: 34px;
  flex-basis: 34px;
  border: 1px solid var(--border-ink);
  border-radius: 10px;
  background: rgb(255 255 255 / 62%);
  box-shadow: 0 3px 8px rgb(15 17 16 / 6%);
  color: var(--assistant-graphite);
}

.assistant-back:hover,
.assistant-action:hover,
.assistant-action--active,
.assistant-action--active:hover {
  border-color: rgba(99, 254, 19, .6);
  background: var(--assistant-accent-soft);
  box-shadow: 0 3px 8px rgb(15 17 16 / 6%);
  color: var(--assistant-graphite);
  transform: translateY(-1px);
}

.assistant-identity { gap: 8px; }
.assistant-identity-mascot {
  display: block;
  width: 28px;
  height: 34px;
  flex: 0 0 28px;
  overflow: hidden;
}
.assistant-identity-icon {
  display: block;
  width: 43px;
  height: 43px;
  max-width: none;
  transform: translate(-7px, -4px);
  object-fit: cover;
  object-position: center;
}
.assistant-heading { min-height: 34px; transform: none; }
.assistant-heading strong {
  color: var(--assistant-graphite);
  font-family: var(--assistant-font-sans);
  font-size: 18px;
  font-weight: 800;
  line-height: 1.1;
  letter-spacing: .02em;
}
.assistant-heading small {
  max-width: 260px;
  margin-top: 3px;
  overflow: hidden;
  color: var(--assistant-pencil);
  font: 600 9px/1.3 var(--font-mono);
  letter-spacing: .015em;
  text-overflow: ellipsis;
  white-space: nowrap;
}
/* 配置层使用纯白表单画布，与资料库内容区保持一致。 */
.assistant-config-panel {
  --font-body: var(--assistant-font-sans);
  inset: 60px 0 0;
  gap: 9px;
  padding: 12px 17px 15px;
  border-bottom: 1px solid var(--border-ink);
  background-color: var(--assistant-paper-white);
  background-image: none;
  box-shadow: 0 8px 18px rgb(15 17 16 / 10%);
}
.assistant-document-panel {
  position: absolute;
  z-index: 4;
  inset: 60px 0 0;
  display: flex;
  min-height: 0;
  flex-direction: column;
  background: var(--assistant-paper-white);
}
.assistant-document-header {
  display: flex;
  min-height: 60px;
  align-items: center;
  justify-content: space-between;
  padding: 0 20px;
  border-bottom: 1px solid var(--border-ink);
}
.assistant-document-header div { display: grid; gap: 3px; }
.assistant-document-header strong { color: var(--assistant-graphite); font: 750 14px/1.2 var(--assistant-font-sans); }
.assistant-document-header small { color: var(--assistant-pencil); font: 600 10px/1.2 var(--assistant-font-sans); }
.assistant-document-header button {
  display: grid;
  width: 32px;
  height: 32px;
  place-items: center;
  border: 1px solid var(--border-ink);
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--assistant-pencil);
  cursor: pointer;
}
.assistant-document-header button:hover { background: rgb(15 17 16 / 6%); color: var(--assistant-graphite); }
.assistant-document-header button:focus-visible { outline: 2px solid var(--assistant-accent); outline-offset: 2px; }
.assistant-document-content {
  min-height: 0;
  flex: 1;
  max-width: 720px;
  width: 100%;
  margin: 0 auto;
  padding: 28px 24px 48px;
  overflow: auto;
  scrollbar-color: rgb(41 48 45 / 48%) transparent;
}
/* 使用普通文档层级，避免说明页和对话内容争夺视觉注意力。 */
.assistant-document-intro h1 {
  margin: 0;
  color: var(--assistant-graphite);
  font: 750 24px/1.25 var(--assistant-font-sans);
  letter-spacing: -.02em;
}
.assistant-document-intro p {
  margin: 9px 0 0;
  color: var(--assistant-pencil);
  font: 400 13px/1.7 var(--assistant-font-sans);
}
.assistant-document-subtitle {
  color: var(--assistant-graphite) !important;
  font: 500 14px/1.45 var(--assistant-font-sans) !important;
}
.assistant-document-subtitle + p { margin-top: 12px; }
/* 状态与主操作放在说明首屏，帮助用户立即进入下一步。 */
.assistant-document-ready {
  display: flex;
  min-height: 52px;
  align-items: center;
  gap: 9px;
  margin-top: 18px;
  padding: 8px 9px 8px 11px;
  border: 1px solid var(--border-ink);
  border-radius: 10px;
  background: rgb(255 255 255 / 58%);
}
.assistant-document-ready-dot {
  width: 7px;
  height: 7px;
  flex: 0 0 7px;
  border-radius: 50%;
  background: #a6ada9;
}
.assistant-document-ready-dot--active {
  background: #4e9e43;
  box-shadow: 0 0 0 3px rgb(78 158 67 / 13%);
}
.assistant-document-ready > div { display: grid; min-width: 0; flex: 1; gap: 2px; }
.assistant-document-ready small { color: var(--assistant-pencil); font: 600 9px/1 var(--assistant-font-mono); letter-spacing: .08em; }
.assistant-document-ready strong { overflow: hidden; color: var(--assistant-graphite); font: 650 11px/1.35 var(--assistant-font-sans); text-overflow: ellipsis; white-space: nowrap; }
.assistant-document-ready button {
  display: inline-flex;
  height: 28px;
  flex: 0 0 auto;
  align-items: center;
  gap: 5px;
  padding: 0 8px;
  border: 1px solid rgba(38, 38, 38, .16);
  border-radius: 7px;
  background: var(--assistant-graphite);
  color: var(--assistant-paper-white);
  cursor: pointer;
  font: 650 10px var(--assistant-font-sans);
}
.assistant-document-ready button:hover { background: #3d423f; }
.assistant-document-ready button:focus-visible { outline: 2px solid var(--assistant-accent); outline-offset: 2px; }
.assistant-document-section {
  margin-top: 30px;
}
.assistant-document-section h2 {
  margin: 0;
  color: var(--assistant-graphite);
  font: 700 15px/1.4 var(--assistant-font-sans);
}
.assistant-document-section > div > p {
  margin: 5px 0 0;
  color: var(--assistant-pencil);
  font: 400 12px/1.55 var(--assistant-font-sans);
}
.assistant-document-steps {
  margin: 10px 0 0;
  padding-left: 20px;
}
.assistant-document-steps li {
  padding: 5px 0 5px 2px;
}
.assistant-document-steps strong { color: var(--assistant-graphite); font: 650 12px/1.5 var(--assistant-font-sans); }
.assistant-document-steps span { margin-left: 5px; color: var(--assistant-pencil); font: 400 12px/1.5 var(--assistant-font-sans); }
.assistant-document-example-list { display: grid; gap: 1px; margin-top: 10px; border-top: 1px solid var(--border-ink); }
.assistant-document-example-list button {
  display: grid;
  gap: 3px;
  padding: 11px 2px;
  border: 0;
  border-bottom: 1px solid var(--border-ink);
  background: transparent;
  color: var(--assistant-graphite);
  cursor: pointer;
  text-align: left;
  transition: color 150ms ease, background 150ms ease;
}
.assistant-document-example-list button:hover {
  background: rgb(15 17 16 / 4%);
  color: #315136;
}
.assistant-document-example-list button:focus-visible { outline: 2px solid var(--assistant-accent); outline-offset: 2px; }
.assistant-document-example-list strong { font: 650 12px/1.45 var(--assistant-font-sans); }
.assistant-document-example-list span {
  min-width: 0;
  color: var(--assistant-pencil);
  font: 400 12px/1.5 var(--assistant-font-sans);
}
.assistant-document-body { margin-top: 30px; }
.assistant-document-body :deep(h2) { margin-top: 28px; padding-bottom: 0; border-bottom: 0; font-size: 17px; }
.assistant-document-body :deep(h3) { margin-top: 18px; color: var(--assistant-graphite); }
.assistant-document-body :deep(h2 + p) { max-width: 58em; color: var(--assistant-pencil); }
.assistant-document-body :deep(ol) { padding-left: 23px; }
.assistant-document-body :deep(li) { padding-left: 2px; }
.assistant-document-body :deep(blockquote) {
  padding: 4px 0 4px 10px;
  border: 0;
  border-left: 2px solid rgb(72 91 74 / 32%);
  color: var(--assistant-pencil);
}
.assistant-document-enter-active,
.assistant-document-leave-active { transition: opacity 160ms ease, transform 180ms var(--motion-easing); }
.assistant-document-enter-from,
.assistant-document-leave-to { opacity: 0; transform: translateY(6px); }
.assistant-config-tabs {
  gap: 3px;
  padding: 3px;
  border: 1px solid var(--border-ink);
  border-radius: 12px;
  background: rgb(255 255 255 / 62%);
}
.assistant-config-tabs button {
  height: 34px;
  border-radius: 8px;
  background: transparent;
  color: var(--assistant-pencil);
  font: 750 11px var(--font-body);
  letter-spacing: .05em;
}
.assistant-config-tabs button + button { border-left: 0; }
.assistant-config-tabs button.is-active {
  background: var(--assistant-graphite);
  box-shadow: 0 2px 5px rgb(15 17 16 / 10%);
  color: var(--assistant-paper-white);
}

.assistant-config-view,
.assistant-model-manager { gap: 9px; }
.assistant-config-sub {
  gap: 8px;
  padding: 11px;
  border: 1px solid var(--border-ink);
  border-radius: 12px;
  background: rgb(255 255 255 / 54%);
  box-shadow: 0 4px 12px rgb(15 17 16 / 5%);
}
.assistant-config-subtitle,
.assistant-section-label,
.assistant-field > span {
  color: var(--assistant-pencil);
  font: 750 9px var(--font-mono);
  letter-spacing: .1em;
}
.assistant-configured { color: var(--assistant-pencil); }
.assistant-configured--error { color: #9a4d42; }
.assistant-current-model {
  gap: 9px;
  min-height: 58px;
  padding: 9px 11px;
  border: 1px solid var(--border-ink);
  border-radius: 10px;
  background: var(--assistant-paper-white);
  box-shadow: 0 3px 8px rgb(15 17 16 / 5%);
}
.assistant-current-model-dot {
  width: 8px;
  height: 8px;
  flex-basis: 8px;
  border: 0;
  border-radius: 50%;
  background: var(--assistant-accent);
  box-shadow: 0 0 0 3px var(--assistant-accent-soft);
}
.assistant-current-model-copy strong,
.assistant-model-option-copy strong { color: var(--assistant-graphite); font-weight: 750; }
.assistant-current-model-copy small,
.assistant-model-option-copy small { color: var(--assistant-pencil); }
.assistant-model-option-current { color: var(--accent-deep); font-weight: 750; }
.assistant-model-list { gap: 12px; }
.assistant-model-filter {
  gap: 6px;
  margin-top: 1px;
}
.assistant-model-list-heading > span:last-child,
.assistant-provider-group-heading > span:last-child { color: var(--assistant-pencil); }
.assistant-provider-group { gap: 5px; }
.assistant-provider-group-heading {
  min-height: 22px;
  padding: 0 3px;
}
.assistant-provider-group-heading > span:first-child {
  color: var(--assistant-graphite);
  font-size: 11px;
}
.assistant-model-options {
  border: 1px solid var(--border-ink);
  border-radius: 12px;
  background: rgb(255 255 255 / 66%);
  box-shadow: 0 3px 10px rgb(15 17 16 / 4%);
}
.assistant-model-option { min-height: 42px; padding: 7px 11px; color: var(--assistant-graphite); }
.assistant-model-option + .assistant-model-option { border-top: 1px solid rgba(38, 38, 38, .08); }
.assistant-model-option:hover:not(:disabled) { background: rgb(99 254 19 / 8%); }
.assistant-model-option:focus-visible { outline-color: var(--assistant-accent); }
.assistant-model-option--current { box-shadow: inset 3px 0 var(--assistant-accent); background: rgb(99 254 19 / 9%); }
.assistant-model-option-action { color: var(--assistant-pencil); font-weight: 700; }
.assistant-model-more {
  padding: 5px 8px;
  border: 1px solid var(--border-ink);
  border-radius: 8px;
  background: var(--assistant-paper-white);
  box-shadow: 0 2px 6px rgb(15 17 16 / 6%);
  color: var(--assistant-graphite);
}
.assistant-model-more:hover { border-color: var(--assistant-graphite); background: var(--assistant-accent-soft); color: var(--assistant-graphite); }

.assistant-field input,
.assistant-provider-trigger {
  height: 34px;
  border: 1px solid var(--border-ink);
  border-radius: 9px;
  background: rgb(255 255 255 / 72%);
  color: var(--assistant-graphite);
  box-shadow: none;
}
.assistant-protocol-switch {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 3px;
  padding: 3px;
  border: 1px solid var(--border-ink);
  border-radius: 9px;
  background: rgb(255 255 255 / 72%);
}
.assistant-protocol-option {
  min-height: 28px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--assistant-pencil);
  cursor: pointer;
  font: 700 10px var(--font-body);
  transition: background 150ms ease, color 150ms ease, box-shadow 150ms ease;
}
.assistant-protocol-option:hover { color: var(--assistant-graphite); background: rgb(15 17 16 / 5%); }
.assistant-protocol-option--selected {
  background: var(--assistant-graphite);
  box-shadow: 0 1px 3px rgb(15 17 16 / 14%);
  color: var(--assistant-paper-white);
}
.assistant-protocol-option--selected:hover { background: var(--assistant-graphite); color: var(--assistant-paper-white); }

/* 搜索来源以单选项卡片呈现，明确标出当前使用中的来源。 */
.assistant-search-source { display: grid; gap: 6px; }
.assistant-search-source-option {
  display: flex;
  width: 100%;
  min-height: 46px;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 8px 11px;
  border: 1px solid var(--border-ink);
  border-radius: 10px;
  background: rgb(255 255 255 / 66%);
  color: var(--assistant-graphite);
  cursor: pointer;
  text-align: left;
  transition: border-color 150ms ease, background 150ms ease, box-shadow 150ms ease;
}
.assistant-search-source-option:hover:not(:disabled) { border-color: var(--assistant-graphite); }
.assistant-search-source-option:disabled { cursor: wait; opacity: .6; }
.assistant-search-source-option--active {
  border-color: rgba(33, 140, 0, .5);
  background: var(--assistant-accent-soft);
  box-shadow: inset 3px 0 0 var(--assistant-accent);
}
.assistant-search-source-copy { display: grid; min-width: 0; gap: 1px; }
.assistant-search-source-copy strong { color: var(--assistant-graphite); font: 700 12px/1.25 var(--font-body); }
.assistant-search-source-copy small { color: var(--assistant-pencil); font: 500 10px/1.3 var(--font-body); }
.assistant-search-source-state {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 3px;
  color: var(--assistant-pencil);
  font: 700 10px var(--font-body);
}
.assistant-search-source-option--active .assistant-search-source-state { color: var(--accent-deep); }
.assistant-search-note { margin: 1px 0 2px; color: var(--assistant-pencil); font: 500 10px/1.6 var(--font-body); }
.assistant-search-link {
  display: inline;
  padding: 0;
  border: 0;
  background: transparent;
  color: #2c7a3d;
  cursor: pointer;
  font: 600 10px/1.6 var(--font-body);
  text-decoration: underline;
}
.assistant-search-link:hover { color: #1f5e2c; }

/* 输入框右侧的当前搜索来源标识，仅作状态展示，避免形似可点击按钮。 */
.assistant-search-indicator {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: var(--assistant-pencil);
  font: 600 10px var(--assistant-font-sans);
  white-space: nowrap;
}
.assistant-search-indicator img { width: 15px; height: 15px; flex: 0 0 auto; }

/* 搜索图标独立定位，输入文字保持稳定的左侧对齐。 */
.assistant-model-search {
  position: relative;
  display: grid;
  align-items: center;
}
.assistant-model-search > svg {
  position: absolute;
  z-index: 1;
  left: 11px;
  color: var(--assistant-faint);
  pointer-events: none;
}
.assistant-model-search input { padding-left: 33px; }
.assistant-field input::placeholder { color: var(--assistant-faint); }
.assistant-provider-trigger > svg { color: var(--assistant-pencil); }
.assistant-provider-trigger[aria-expanded="true"] { border-color: rgba(33, 140, 0, .56); background: rgb(99 254 19 / 7%); }
.assistant-provider-menu {
  padding: 4px;
  border: 1px solid var(--border-ink);
  border-radius: 10px;
  background: var(--assistant-paper-white);
  box-shadow: 0 10px 24px rgb(15 17 16 / 14%);
}
.assistant-provider-option { border-radius: 7px; color: var(--assistant-graphite); }
.assistant-provider-option:hover,
.assistant-provider-option--selected { background: var(--assistant-accent-soft); color: var(--assistant-graphite); }
.assistant-field input:focus,
.assistant-provider-trigger:focus-visible {
  border-color: rgba(33, 140, 0, .56);
  outline: 0;
  box-shadow: 0 0 0 3px rgb(99 254 19 / 14%);
}

/* 配置页控件共享克制的键盘焦点，避免默认荧光描边喧宾夺主。 */
.assistant-config-panel button:focus-visible {
  outline: 0;
  box-shadow: 0 0 0 3px rgb(99 254 19 / 14%);
}
.assistant-save {
  padding: 7px 12px;
  border: 1px solid var(--assistant-graphite);
  border-radius: 9px;
  background: var(--assistant-graphite);
  box-shadow: 0 3px 8px rgb(15 17 16 / 12%);
  color: var(--assistant-paper-white);
  font-weight: 750;
}
.assistant-save:hover,
.assistant-save--primary,
.assistant-save--primary:hover { background: #35413c; color: var(--assistant-paper-white); }
.assistant-provider-actions { display: flex; flex-wrap: wrap; gap: 7px; }
.assistant-provider-clean {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 7px 10px;
  border: 1px solid rgb(164 69 57 / 34%);
  border-radius: 9px;
  background: rgb(255 255 255 / 52%);
  color: #9a4d42;
  cursor: pointer;
  font: 700 11px var(--font-body);
}
.assistant-provider-clean:hover:not(:disabled) { border-color: rgb(164 69 57 / 52%); background: rgb(164 69 57 / 8%); }
.assistant-provider-clean:disabled { cursor: wait; opacity: .52; }

/* 空状态只保留一个明确问题，功能通过输入框自然发现。 */
.assistant-messages { gap: 14px; padding: 22px 20px; }
.assistant-empty {
  width: min(100%, 360px);
  justify-items: center;
  text-align: center;
}
.assistant-empty-intro { justify-content: center; }
.assistant-empty-copy { padding-top: 0; }
.assistant-empty strong { font-size: 20px; }
.assistant-documentation-link {
  display: inline-flex;
  width: fit-content;
  align-items: center;
  justify-self: center;
  gap: 5px;
  padding: 3px 0;
  border: 0;
  background: transparent;
  color: var(--assistant-pencil);
  cursor: pointer;
  font: 650 11px/1.4 var(--assistant-font-sans);
  text-decoration: underline;
  text-decoration-color: rgb(101 112 103 / 36%);
  text-underline-offset: 3px;
}
.assistant-documentation-link:hover { color: var(--assistant-graphite); text-decoration-color: currentcolor; }
.assistant-documentation-link:focus-visible { outline: 2px solid var(--assistant-accent); outline-offset: 3px; }
.assistant-empty-cursor {
  display: inline-block;
  margin-left: 2px;
  color: var(--assistant-pencil);
  animation: assistant-empty-cursor-blink 900ms steps(1, end) infinite;
}
@keyframes assistant-empty-cursor-blink {
  50% { opacity: 0; }
}
.assistant-latest-button {
  position: absolute;
  z-index: 2;
  right: 8px;
  bottom: calc(100% + 8px);
  display: inline-flex;
  align-items: center;
  gap: 5px;
  min-height: 29px;
  padding: 0 9px;
  border: 1px solid var(--border-ink);
  border-radius: 999px;
  background: rgb(255 255 255 / 92%);
  box-shadow: 0 5px 16px rgb(15 17 16 / 14%);
  color: var(--assistant-graphite);
  cursor: pointer;
  font: 700 10px var(--assistant-font-sans);
  transition: border-color 150ms ease, background 150ms ease, transform 150ms var(--motion-easing);
}
.assistant-latest-button:hover { border-color: rgba(33, 140, 0, .5); background: var(--assistant-paper-white); transform: translateY(-1px); }
.assistant-latest-button:focus-visible { outline: 2px solid var(--assistant-accent); outline-offset: 2px; }
.assistant-empty { width: min(100%, 470px); gap: 18px; padding: 20px 4px; }
.assistant-empty-intro { gap: 15px; }
.assistant-empty-copy { gap: 5px; padding-top: 4px; }
.assistant-empty strong {
  color: var(--assistant-graphite);
  font: 800 20px/1.25 var(--font-display);
  letter-spacing: .06em;
}
.assistant-bubble { gap: 9px; }
.assistant-bubble--assistant { width: min(100%, 620px); }
.assistant-bubble--assistant .assistant-bubble-inner { min-width: 0; flex: 1; }
.assistant-message-avatar {
  width: 31px;
  height: 31px;
  flex-basis: 31px;
  filter: saturate(.8) contrast(1.04);
}
.assistant-bubble-inner {
  position: relative;
  padding: 10px 13px;
  border: 1px solid var(--border-ink);
  border-radius: 12px 12px 12px 5px;
  background: rgb(255 255 255 / 72%);
  box-shadow: 0 3px 10px rgb(15 17 16 / 5%);
}
.assistant-bubble--assistant .assistant-bubble-inner:not(.assistant-bubble-inner--error) {
  max-width: none;
  padding: 0 0 18px;
  border: 0;
  border-radius: 0;
  background: transparent;
  box-shadow: none;
}
.assistant-bubble-inner::before {
  position: absolute;
  top: 5px;
  right: 5px;
  width: 14px;
  height: 1px;
  background: rgb(38 38 38 / 13%);
  content: '';
  transform: rotate(-12deg);
}
.assistant-bubble--assistant .assistant-bubble-inner:not(.assistant-bubble-inner--error)::before { display: none; }
.assistant-bubble--user .assistant-bubble-inner {
  border-color: var(--assistant-graphite);
  border-radius: 12px 12px 5px;
  background: var(--assistant-graphite);
  box-shadow: 0 3px 10px rgb(15 17 16 / 12%);
}
.assistant-bubble-inner p { color: var(--assistant-graphite); font: 13px/1.7 var(--assistant-font-sans); }
.assistant-bubble--user .assistant-bubble-inner p { color: var(--paper-white); }
.assistant-bubble--user .assistant-bubble-inner::before { background: rgb(255 255 255 / 22%); }
.assistant-bubble-inner--error { border-color: rgb(164 69 57 / 42%); background: rgb(255 247 245 / 88%); }
.assistant-bubble-inner--error p { color: #9a4d42; }
.assistant-markdown { color: var(--assistant-graphite); font: 13px/1.7 var(--assistant-font-sans); overflow-wrap: anywhere; }
.assistant-bubble-inner--error .assistant-markdown { color: #9a4d42; }
.assistant-token-usage {
  display: block;
  margin-top: 8px;
  color: rgb(72 91 74 / 64%);
  font: 600 10px/1 var(--font-mono);
  text-align: right;
}
:deep(.assistant-markdown > :first-child) { margin-top: 0; }
:deep(.assistant-markdown > :last-child) { margin-bottom: 0; }
:deep(.assistant-markdown p) { margin: 0 0 9px; }
:deep(.assistant-markdown h1),
:deep(.assistant-markdown h2),
:deep(.assistant-markdown h3),
:deep(.assistant-markdown h4) { margin: 15px 0 7px; color: var(--ink-deep); font-family: var(--assistant-font-sans); line-height: 1.35; }
:deep(.assistant-markdown h1) { font-size: 18px; }
:deep(.assistant-markdown h2) { padding-bottom: 4px; border-bottom: 1px solid var(--border-ink); font-size: 16px; }
:deep(.assistant-markdown h3) { font-size: 14px; }
:deep(.assistant-markdown h4) { font-size: 13px; }
:deep(.assistant-markdown ul),
:deep(.assistant-markdown ol) { margin: 7px 0 10px; padding-left: 20px; }
:deep(.assistant-markdown li + li) { margin-top: 3px; }
:deep(.assistant-markdown strong) { color: var(--ink-deep); font-weight: 750; }
:deep(.assistant-markdown code) { padding: 1px 4px; border-radius: 4px; background: rgb(15 17 16 / 7%); color: #35652f; font: 12px/1.5 var(--font-mono); }
:deep(.assistant-markdown pre) { margin: 10px 0; padding: 10px; overflow: auto; border: 1px solid var(--border-ink); border-radius: 8px; background: #f4f6f1; }
:deep(.assistant-markdown pre code) { padding: 0; background: transparent; color: var(--ink); }
:deep(.assistant-markdown blockquote) { margin: 9px 0; padding: 5px 0 5px 10px; border-left: 3px solid var(--accent-deep); color: var(--ink-soft); }
/* 助手正文采用稳定的阅读节奏，避免工具记录与正式回答争夺视觉层级。 */
.assistant-answer { max-width: 64ch; color: #344036; font-size: 14px; line-height: 1.82; letter-spacing: .003em; }
.assistant-answer :deep(p) { margin-bottom: 13px; }
.assistant-answer :deep(h1),
.assistant-answer :deep(h2),
.assistant-answer :deep(h3),
.assistant-answer :deep(h4) { color: #283329; font-weight: 760; }
.assistant-answer :deep(h1) { margin: 22px 0 10px; font-size: 20px; letter-spacing: -.012em; }
.assistant-answer :deep(h2) { margin: 24px 0 10px; padding-bottom: 6px; border-bottom-color: rgb(72 91 74 / 16%); font-size: 16px; }
.assistant-answer :deep(h3) { margin: 19px 0 8px; font-size: 14px; }
.assistant-answer :deep(h4) { margin: 16px 0 7px; font-size: 13px; }
.assistant-answer :deep(ul),
.assistant-answer :deep(ol) { margin: 9px 0 14px; padding-left: 22px; }
.assistant-answer :deep(li + li) { margin-top: 5px; }
.assistant-answer :deep(.task-list) { display: grid; gap: 6px; padding-left: 0; list-style: none; }
.assistant-answer :deep(.task-list-item) { display: flex; align-items: flex-start; gap: 7px; }
.assistant-answer :deep(.task-list-item + .task-list-item) { margin-top: 0; }
.assistant-answer :deep(.task-list-item input) { width: 13px; height: 13px; flex: 0 0 13px; margin: 5px 0 0; accent-color: #4d884d; opacity: 1; }
.assistant-answer :deep(em) { color: #526356; }
.assistant-answer :deep(del) { color: #778279; text-decoration-color: rgb(72 91 74 / 48%); }
.assistant-answer :deep(blockquote) { margin: 13px 0; padding: 8px 12px; border-left-color: #6c9a70; border-radius: 0 7px 7px 0; background: rgb(110 151 109 / 8%); color: #536156; }
.assistant-answer :deep(a) { color: #3e7744; font-weight: 650; text-decoration-color: rgb(62 119 68 / 42%); text-decoration-thickness: 1px; text-underline-offset: 3px; }
.assistant-answer :deep(a:hover) { color: #285f31; text-decoration-color: currentColor; }
.assistant-answer :deep(a:focus-visible) { border-radius: 3px; outline: 2px solid rgb(99 254 19 / 68%); outline-offset: 2px; }
.assistant-answer :deep(hr) { height: 1px; margin: 18px 0; border: 0; background: rgb(72 91 74 / 14%); }
.assistant-answer :deep(table) { display: block; max-width: 100%; margin: 15px 0; overflow-x: auto; border: 1px solid rgb(72 91 74 / 14%); border-radius: 9px; border-collapse: separate; border-spacing: 0; background: rgb(255 255 255 / 48%); font-size: 12px; line-height: 1.55; }
.assistant-answer :deep(th),
.assistant-answer :deep(td) { min-width: 104px; padding: 8px 10px; border-right: 1px solid rgb(72 91 74 / 12%); border-bottom: 1px solid rgb(72 91 74 / 12%); text-align: left; vertical-align: top; }
.assistant-answer :deep(th) { background: rgb(110 151 109 / 9%); color: #334635; font-weight: 750; }
.assistant-answer :deep(th:last-child),
.assistant-answer :deep(td:last-child) { border-right: 0; }
.assistant-answer :deep(tbody tr:last-child td) { border-bottom: 0; }
.assistant-answer :deep(tbody tr:nth-child(even) td) { background: rgb(110 151 109 / 3%); }
/* 执行过程使用紧凑任务清单，避免呈现为调试日志。 */
.assistant-activity {
  min-width: 0;
  margin: 0 0 12px;
}
.assistant-activity-note { margin: 0 0 7px; color: #5f6d61; font-size: 10px; }
.assistant-activity-note :deep(p) { margin: 0; }
.assistant-activity-thinking,
.assistant-activity-generating,
.assistant-activity-waiting { display: flex; align-items: center; gap: 6px; padding-top: 7px; color: #7d897e; font: 600 10px/1.4 var(--assistant-font-sans); }
.assistant-activity-thinking span,
.assistant-activity-generating span,
.assistant-activity-waiting span { width: 5px; height: 5px; border-radius: 50%; background: #6f9a72; animation: assistant-tool-call-pulse 1.1s ease-in-out infinite; }
/* 耗时区域始终与后续内容分隔，避免处理状态切换时版面跳动。 */
.assistant-activity {
  margin-bottom: 8px;
  padding-bottom: 10px;
  border-bottom: 1px solid rgb(72 91 74 / 14%);
}
/* 授权结果单独呈现用户决定与实际影响，避免与助手正文混淆。 */
.assistant-write-result {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin: 9px 0 8px;
  padding: 8px 10px;
  border: 1px solid rgba(68, 117, 73, .16);
  border-left: 3px solid #5c8f61;
  border-radius: 8px;
  background: #f6faf3;
}
.assistant-write-result--rejected { border-color: rgba(151, 89, 79, .17); border-left-color: #ae6359; background: #fff8f6; }
.assistant-write-result--failed { border-color: rgba(164, 126, 55, .18); border-left-color: #a57c38; background: #fffbf2; }
.assistant-write-result-icon { display: grid; flex: 0 0 auto; width: 19px; height: 19px; place-items: center; border-radius: 50%; background: #e5f2df; color: #4f8558; }
.assistant-write-result--rejected .assistant-write-result-icon { background: #fde8e4; color: #a55047; }
.assistant-write-result--failed .assistant-write-result-icon { background: #f9edcf; color: #98702e; }
.assistant-write-result > div { display: grid; gap: 1px; min-width: 0; }
.assistant-write-result small { color: #758276; font: 650 9px/1.3 var(--assistant-font-sans); }
.assistant-write-result strong { color: #354236; font: 750 11px/1.35 var(--assistant-font-sans); }
.assistant-write-result p { margin: 1px 0 0; color: #59665a; font: 11px/1.45 var(--assistant-font-sans); }
.assistant-write-result--rejected strong { color: #86483f; }
.assistant-write-result--failed strong { color: #806128; }
.assistant-reasoning {
  min-width: 0;
  color: var(--assistant-pencil);
}
.assistant-reasoning-trigger {
  display: flex;
  align-items: center;
  gap: 7px;
  min-height: 24px;
  padding: 0;
  border: 0;
  background: transparent;
  color: #8c938c;
  cursor: pointer;
  font: 500 12px/1.5 var(--assistant-font-sans);
  letter-spacing: .005em;
  text-align: left;
  user-select: none;
}
.assistant-activity-caret { flex: 0 0 auto; margin-left: -2px; transition: transform 160ms var(--motion-easing); }
.assistant-activity[open] .assistant-activity-caret { transform: rotate(90deg); }
.assistant-status-shimmer {
  color: transparent;
  background: linear-gradient(90deg, #627064 0%, #627064 38%, #aeb8af 50%, #627064 62%, #627064 100%);
  background-size: 220% 100%;
  background-clip: text;
  -webkit-background-clip: text;
  animation: assistant-tool-text-shimmer 1.8s linear infinite;
}
.assistant-reasoning-status { margin-top: 2px; font: 500 10px/1.4 var(--assistant-font-sans); }
.assistant-reasoning-duration {
  color: #969d96;
  font-weight: 400;
}
@keyframes assistant-tool-text-shimmer {
  from { background-position: 100% 0; }
  to { background-position: -120% 0; }
}
@media (prefers-reduced-motion: reduce) {
  .assistant-status-shimmer { animation: none; color: #627064; background: none; }
}

/* 输入区使用单一承载面，避免禁用状态出现割裂的灰色内框。 */
.assistant-composer {
  position: relative;
  display: grid;
  gap: 6px;
  align-items: stretch;
  margin: 0 12px 12px;
  padding: 8px 10px 8px 12px;
  border: 1px solid rgb(41 48 45 / 14%);
  border-radius: 14px;
  background: rgb(255 255 255 / 94%);
  box-shadow: 0 4px 14px rgb(15 17 16 / 7%);
  transition: border-color 150ms ease, box-shadow 150ms ease;
}
.assistant-composer:focus-within {
  border-color: rgb(41 48 45 / 30%);
  box-shadow: 0 4px 14px rgb(15 17 16 / 7%), 0 0 0 3px rgb(99 254 19 / 12%);
}
.assistant-composer--unavailable { border-color: rgb(41 48 45 / 11%); background: #fbfcfa; }
.assistant-composer-toolbar { display: flex; min-height: 30px; align-items: center; justify-content: space-between; gap: 10px; }
.assistant-composer-actions { display: flex; flex: 0 0 auto; align-items: center; gap: 3px; }
.assistant-composer-meta { position: relative; display: flex; width: auto; height: 30px; flex: 0 0 auto; align-items: center; }
.assistant-composer-status { color: var(--assistant-faint); font: 700 11px/1 var(--assistant-font-sans); }
/* 未配置模型时保留明确的下一步操作，避免底栏只剩孤立的禁用按钮。 */
.assistant-composer-setup {
  display: inline-flex;
  min-height: 28px;
  align-items: center;
  gap: 6px;
  padding: 0 7px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--assistant-pencil);
  cursor: pointer;
  font: 700 11px/1 var(--assistant-font-sans);
  transition: background 150ms ease, color 150ms ease, transform 150ms var(--motion-easing);
}
.assistant-composer-setup:hover { background: var(--assistant-accent-soft); color: var(--assistant-graphite); }
.assistant-composer-setup:active { transform: scale(.98); }
.assistant-composer-setup:focus-visible { outline: 2px solid rgb(99 254 19 / 46%); outline-offset: -1px; }
/* 操作组使用紧凑尺寸，让注意力始终停留在输入内容。 */
.assistant-thinking-trigger { display: flex; width: auto; min-width: 30px; height: 30px; align-items: center; justify-content: center; gap: 4px; padding: 0 5px; border: 0; border-radius: 7px; background: transparent; box-shadow: none; color: var(--assistant-pencil); cursor: pointer; font: 700 10px var(--assistant-font-sans); transition: color 150ms ease, transform 150ms var(--motion-easing); }
.assistant-thinking-trigger:hover:not(:disabled),
.assistant-thinking-trigger--open { background: transparent; color: var(--assistant-graphite); }
.assistant-thinking-trigger:active:not(:disabled) { transform: translateY(0) scale(.98); }
.assistant-thinking-trigger:disabled { cursor: not-allowed; opacity: .58; }
.assistant-thinking-level { white-space: nowrap; }
.assistant-thinking-trigger:focus-visible,
.assistant-send:focus-visible { outline: 2px solid rgb(99 254 19 / 46%); outline-offset: -2px; }
.assistant-thinking-menu { position: absolute; z-index: 8; right: 0; bottom: calc(100% + 7px); display: grid; width: 96px; gap: 2px; padding: 4px; border: 1px solid var(--border-ink); border-radius: 10px; background: var(--assistant-paper-white); box-shadow: 0 8px 20px rgb(15 17 16 / 12%); }
.assistant-thinking-menu button { display: flex; width: 100%; min-height: 30px; align-items: center; justify-content: space-between; padding: 0 8px; border: 0; border-radius: 7px; background: transparent; color: var(--assistant-pencil); cursor: pointer; font: 700 10px var(--assistant-font-sans); text-align: left; }
.assistant-thinking-menu button:hover:not(:disabled) { background: rgb(15 17 16 / 5%); color: var(--assistant-graphite); }
.assistant-thinking-menu button.is-active { background: var(--assistant-accent-soft); color: var(--assistant-graphite); cursor: default; }
.assistant-composer-input { display: flex; min-width: 0; }
.assistant-composer textarea {
  box-sizing: border-box;
  display: block;
  width: 100%;
  min-height: 40px;
  max-height: 128px;
  padding: 6px 2px 4px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  box-shadow: none;
  color: var(--assistant-graphite);
  font: 12px/1.5 var(--assistant-font-mono);
  overflow-y: hidden;
  resize: none;
}
.assistant-composer textarea::placeholder { color: var(--assistant-faint); }
.assistant-composer textarea:focus {
  outline: 0;
}
.assistant-composer textarea:disabled { background: transparent; color: var(--assistant-faint); cursor: not-allowed; }
.assistant-send {
  display: grid;
  width: 30px;
  height: 30px;
  flex: 0 0 30px;
  place-items: center;
  border: 0;
  border-radius: 50%;
  background: var(--assistant-graphite);
  box-shadow: none;
  color: var(--assistant-paper-white);
  transition: background 150ms ease, color 150ms ease, transform 150ms var(--motion-easing);
}
.assistant-send:hover:not(:disabled) { background: #3f4b40; color: #fff; transform: translateY(-1px); }
.assistant-send:active:not(:disabled) { transform: translateY(0) scale(.98); }
.assistant-send:disabled { background: #e0e4dd; color: #9aa39a; opacity: 1; }
/* 终止控制保留清晰边界，避免只显示孤立的红色方块。 */
.assistant-send--stop {
  border: 1px solid rgb(181 74 64 / 38%);
  border-radius: 10px;
  background: linear-gradient(145deg, #fff7f5, #fae8e5);
  box-shadow: inset 0 1px rgb(255 255 255 / 82%), 0 2px 5px rgb(150 57 48 / 10%);
  color: #a34039;
}
.assistant-send--stop:hover:not(:disabled) {
  background: #f6dcd8;
  color: #872f29;
  transform: translateY(-1px);
}
.assistant-send--stop:active:not(:disabled) { transform: translateY(0) scale(.96); }

.assistant-config-panel,
.assistant-messages { scrollbar-color: rgb(41 48 45 / 48%) transparent; }
.assistant-config-panel::-webkit-scrollbar-thumb,
.assistant-messages::-webkit-scrollbar-thumb { background-color: rgb(41 48 45 / 48%); }
.assistant-config-panel::-webkit-scrollbar-thumb:hover,
.assistant-messages::-webkit-scrollbar-thumb:hover { background-color: rgb(41 48 45 / 68%); }

@media (max-width: 520px) {
  .assistant-topbar,
  .assistant-config-panel,
  .assistant-composer { padding-right: 12px; padding-left: 12px; }
  .assistant-messages { padding: 16px 12px; }
  .assistant-document-header { padding: 0 12px; }
  .assistant-document-content { padding: 18px 14px 28px; }
  .assistant-document-ready { margin-top: 16px; }
  .assistant-document-section { margin-top: 24px; }
  .assistant-document-example-list button { gap: 2px; }
  .assistant-document-body { margin-top: 28px; }
  .assistant-latest-button { right: 12px; }
  .assistant-empty strong { font-size: 18px; }
  .assistant-page { --assistant-sidebar-width: 170px; }
  .assistant-conversation-sidebar { padding: 10px 7px; }
}

@media (prefers-reduced-motion: reduce) {
  .assistant-back,
  .assistant-action,
  .assistant-conversation-toggle,
  .assistant-send,
  .assistant-latest-button { transition: none; }
  .assistant-document-enter-active,
  .assistant-document-leave-active { transition: none; }
  .assistant-conversation-loading { animation: none; }
  .assistant-empty-cursor { animation: none; }
}
</style>
