// 收起态动画元数据由收起视图和设置预览共同复用。
export const donghuaList = [
  { id: 'kulian', mingcheng: '委屈', shuoming: '安静陪伴' },
  { id: 'daxiao', mingcheng: '大笑', shuoming: '元气回应' },
  { id: 'aixin', mingcheng: '心动', shuoming: '温柔问候' },
]

const donghuaJiazaiMap = {
  kulian: () => import('@/assets/cat-crying.json'),
  daxiao: () => import('@/assets/cat-laughing.json'),
  aixin: () => import('@/assets/cat-loving.json'),
}

// 仅在动画实际展示时载入对应资源，避免阻塞启动首帧。
export async function jiazaiDonghuaData(animationId) {
  const jiazaiDonghua = donghuaJiazaiMap[animationId]
  if (!jiazaiDonghua) return null
  const module = await jiazaiDonghua()
  return module.default
}
