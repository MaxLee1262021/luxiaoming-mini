const { normalizeAlbumPresentation } = require('../miniprogram/utils/albumPresentation')
const album = normalizeAlbumPresentation({ _id: 'alb1', photoCount: 6, intro: '清透明亮，12 张样片。' })
if (album.photoCount !== 6 || album.sampleCount !== 6 || !album.intro.includes('6 张照片') || album.intro.includes('12 张样片')) throw new Error('album metadata not normalized')
console.log('album metadata consistency PASS')
