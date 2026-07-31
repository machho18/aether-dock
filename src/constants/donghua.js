import catCryingAnimation from '@/assets/cat-crying.json'
import catLaughingAnimation from '@/assets/cat-laughing.json'
import catLovingAnimation from '@/assets/cat-loving.json'

// 收起态动画元数据由收起视图和设置预览共同复用。
export const donghuaList = [
  { id: 'kulian', mingcheng: '委屈', shuoming: '安静陪伴', data: catCryingAnimation },
  { id: 'daxiao', mingcheng: '大笑', shuoming: '元气回应', data: catLaughingAnimation },
  { id: 'aixin', mingcheng: '心动', shuoming: '温柔问候', data: catLovingAnimation },
]
