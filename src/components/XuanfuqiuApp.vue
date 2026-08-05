<template>
  <main class="shouqikou-root">
    <button
      :key="weizhiTishiXuhao"
      class="shouqikou"
      :class="{ 'shouqikou--position-tip': isWeizhiTishiVisible }"
      type="button"
      aria-label="展开 AetherDock"
      title="展开 AetherDock"
      @pointerenter="jieshouMouse"
      @pointerleave="huifuMousePassthrough"
      @click="huifuLingdongchuangkou"
    >
      <span class="shouqikou-biaozhi" aria-hidden="true">
        <span class="shouqikou-zhuangtai"></span>
      </span>
      <span class="shouqikou-wenzi">展开 AetherDock</span>
      <span class="shouqikou-jiantou" aria-hidden="true">↗</span>
    </button>
  </main>
</template>

<script setup>
import { onBeforeUnmount, shallowRef } from 'vue'

let isPassthrough = true
const isWeizhiTishiVisible = shallowRef(false)
const weizhiTishiXuhao = shallowRef(0)

// 每次收起坞显示时播放一次入位提示，帮助用户确认它固定在左下角。
function bofangWeizhiTishi() {
  isWeizhiTishiVisible.value = true
  weizhiTishiXuhao.value += 1
}

const quxiaoXianshiTishiListener = window.aetherDock?.onFloatingWindowShown?.(bofangWeizhiTishi)
onBeforeUnmount(() => quxiaoXianshiTishiListener?.())

function jieshouMouse() {
  shezhiMousePassthrough(false)
}

function huifuLingdongchuangkou() {
  void window.aetherDock?.setFloatingMode(false)
}

function huifuMousePassthrough() {
  shezhiMousePassthrough(true)
}

function shezhiMousePassthrough(passthrough) {
  if (isPassthrough === passthrough) return
  isPassthrough = passthrough
  void window.aetherDock?.setIslandPassthrough(passthrough)
}
</script>

<style scoped>
.shouqikou-root {
  display: flex;
  width: 226px;
  height: 64px;
  align-items: center;
  padding-left: 10px;
  background: transparent;
  pointer-events: none;
}

/* 收起坞以紧凑图标作为默认入口，移入后在固定画布内平滑展开。 */
.shouqikou {
  position: relative;
  display: flex;
  width: 52px;
  height: 52px;
  padding: 0;
  align-items: center;
  gap: 10px;
  overflow: hidden;
  isolation: isolate;
  appearance: none;
  -webkit-appearance: none;
  border: 1px solid rgba(255, 255, 255, .14);
  border-radius: 18px;
  background: linear-gradient(145deg, rgba(43, 49, 46, .98), rgba(15, 18, 17, .98));
  box-shadow: inset 0 1px rgba(255, 255, 255, .12), 0 8px 20px rgba(0, 0, 0, .28);
  color: #f4f7f4;
  cursor: pointer;
  pointer-events: auto;
  transition: width 220ms cubic-bezier(.16, 1, .3, 1), border-color 180ms ease, box-shadow 180ms ease, background 180ms ease;
  -webkit-app-region: no-drag;
}

/* 刀锋亮光仅扫过一次外壳，强化坞已在左下角就位的反馈。 */
.shouqikou::after { position: absolute; z-index: 2; inset: -52% -28px; background: linear-gradient(108deg, transparent 43%, rgba(234, 255, 226, .06) 47%, rgba(221, 255, 204, .82) 50%, rgba(156, 255, 117, .28) 53%, transparent 58%); content: ""; opacity: 0; pointer-events: none; transform: translateX(-72%) skewX(-18deg); }

.shouqikou:hover {
  width: 210px;
  border-color: rgba(170, 255, 139, .36);
  background: linear-gradient(145deg, rgba(48, 58, 52, .99), rgba(15, 20, 17, .99));
  box-shadow: inset 0 1px rgba(255, 255, 255, .16), 0 10px 26px rgba(0, 0, 0, .34), 0 0 18px rgba(99, 254, 19, .12);
}

/* 入位提示仅在底部坞刚出现时运行一次，强调固定停靠位置。 */
.shouqikou--position-tip { animation: shouqikou-position-tip 760ms cubic-bezier(.16, 1, .3, 1) both; }
.shouqikou--position-tip::after { animation: shouqikou-blade-flash 760ms cubic-bezier(.16, 1, .3, 1) both; }
@keyframes shouqikou-position-tip {
  0% { opacity: 0; transform: translateX(-18px) scale(.92); }
  58% { opacity: 1; transform: translateX(3px) scale(1.02); }
  100% { opacity: 1; transform: translateX(0) scale(1); }
}
@keyframes shouqikou-blade-flash {
  0%, 20% { opacity: 0; transform: translateX(-72%) skewX(-18deg); }
  38% { opacity: 1; }
  66% { opacity: .72; transform: translateX(72%) skewX(-18deg); }
  100% { opacity: 0; transform: translateX(92%) skewX(-18deg); }
}

.shouqikou:active { transform: translateY(1px); }
.shouqikou:focus-visible { border-color: rgba(166, 255, 132, .72); box-shadow: 0 0 0 2px rgba(99, 254, 19, .55), 0 10px 26px rgba(0, 0, 0, .34); }

.shouqikou-biaozhi {
  position: relative;
  flex: 0 0 auto;
  width: 34px;
  height: 34px;
  margin-left: 8px;
  border: 1px solid rgba(235, 255, 226, .42);
  border-radius: 12px;
  background: radial-gradient(circle at 35% 28%, rgba(232, 255, 220, .64), transparent 17%), linear-gradient(145deg, #4c8551, #1e3a22 62%, #152519);
  box-shadow: inset 0 1px rgba(255, 255, 255, .35), inset 0 -7px 10px rgba(0, 0, 0, .28);
}

.shouqikou-biaozhi::before { position: absolute; inset: 8px; border: 1px solid rgba(231, 255, 218, .78); border-radius: 7px; content: ""; }
.shouqikou-zhuangtai { position: absolute; right: -2px; bottom: -2px; width: 9px; height: 9px; border: 2px solid #202922; border-radius: 50%; background: #8dff60; box-shadow: 0 0 8px rgba(118, 255, 75, .85); }

.shouqikou-wenzi { min-width: 0; max-width: 0; overflow: hidden; color: rgba(248, 251, 247, .94); font-size: 13px; font-weight: 600; letter-spacing: .01em; opacity: 0; transform: translateX(-5px); transition: max-width 220ms cubic-bezier(.16, 1, .3, 1), opacity 140ms ease, transform 220ms cubic-bezier(.16, 1, .3, 1); white-space: nowrap; }
.shouqikou-jiantou { margin-left: auto; margin-right: 13px; color: #a7ffa0; font-size: 15px; line-height: 1; opacity: 0; transform: translateX(-5px); transition: opacity 160ms ease 35ms, transform 220ms cubic-bezier(.16, 1, .3, 1); }
.shouqikou:hover .shouqikou-wenzi { max-width: 124px; opacity: 1; transform: translateX(0); }
.shouqikou:hover .shouqikou-jiantou { opacity: .9; transform: translateX(0); }

@media (prefers-reduced-motion: reduce) {
  .shouqikou,
  .shouqikou-wenzi,
  .shouqikou-jiantou { transition: none; }
  .shouqikou--position-tip { animation: none; }
  .shouqikou--position-tip::after { animation: none; }
}

@media (prefers-reduced-transparency: reduce) {
  .shouqikou { background: #252a26; }
}
</style>
