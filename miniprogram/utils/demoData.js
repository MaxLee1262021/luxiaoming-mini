// ===== 统一默认拍摄说明（各详情页兜底，将来由后台数据覆盖） =====
const DEFAULT_SHOOTING_INSTRUCTIONS = [
  '建议提前 1 天预约，方便为你锁定拍摄时段。',
  '拍摄当天请准时到达约定地点，客服会提前确认集合信息。',
  '如遇天气原因，可联系客服协商改期。',
  '样片仅作风格参考，最终成片以实际拍摄为准。'
]

const cover = '/images/banner1.png'
const coverAlt = '/images/banner2.png'
const coverFallback = '/images/placeholder.png'

// 商品类型单一真相源：为每个商品标注规范的 category 字段（photo_single/photo_package/video_single/peripheral）
const { resolveCategory } = require('./product')

// 演示阶段用的公开测试视频 URL（真机上线前请替换为业务 CDN 视频）
const DEMO_VIDEO_URL = 'https://wxsnsdy.tc.qq.com/105/20210/snsdyvideodownload?filekey=30280201010421301f0201690402534804102ca905ce620b1241b726bc41dcff44e00204012882540400&bizid=1023&hy=SH&fileparam=302c020101042530230204136ffd93020457e3c4ff02024ef202031e8d7f02030f42400204045a320a0201000400'

const sampleNine = [
  cover,
  coverAlt,
  coverFallback,
  cover,
  coverAlt,
  coverFallback,
  cover,
  coverAlt,
  coverFallback
]

const spots = [
  {
    _id: 'demo-spot-dufu',
    name: '杜甫江阁',
    latitude: 28.1895,
    longitude: 112.9445,
    cover,
    image: cover,
    address: '长沙市天心区湘江中路',
    description: '湘江夜景、古建轮廓和城市灯光都很出片，适合国风写真、情侣大片和夜景短视频。',
    tags: ['江景', '古建', '夜景'],
    styles: ['国风', '江景', '夜色'],
    hotScore: 9.6,
    checkinCount: 1280,
    rating: '4.8',
    seriesCount: 3,
    level: 'must'
  },
  {
    _id: 'demo-spot-ifs',
    name: 'IFS 国金中心',
    latitude: 28.1947,
    longitude: 112.9743,
    cover: coverAlt,
    image: coverAlt,
    address: '长沙市芙蓉区解放西路',
    description: '城市地标、潮流街拍和夜景氛围都很强，适合单人、闺蜜和短视频产品。',
    tags: ['地标', '潮流', '夜景'],
    styles: ['都市', '街拍', '高级感'],
    hotScore: 9.8,
    checkinCount: 1560,
    rating: '4.9',
    seriesCount: 4,
    level: 'must'
  },
  {
    _id: 'demo-spot-orange',
    name: '橘子洲',
    latitude: 28.1863,
    longitude: 112.9538,
    cover,
    image: cover,
    address: '长沙市岳麓区橘子洲头',
    description: '江景、草坪、城市天际线适合亲子旅拍、情侣写真和旅行纪念照。',
    tags: ['江景', '亲子', '旅行'],
    styles: ['清新', '自然光', '亲子'],
    hotScore: 9.5,
    checkinCount: 1180,
    rating: '4.8',
    seriesCount: 3,
    level: 'must'
  },
  {
    _id: 'demo-spot-taiping',
    name: '太平老街',
    latitude: 28.1953,
    longitude: 112.9668,
    cover: coverAlt,
    image: coverAlt,
    address: '长沙市天心区太平街',
    description: '老街巷口、烟火气和复古招牌适合国风写真、城市漫步和故事感街拍。',
    tags: ['老街', '古风', '烟火气'],
    styles: ['复古', '国风', '街拍'],
    hotScore: 9.3,
    checkinCount: 920,
    rating: '4.8',
    seriesCount: 3
  },
  {
    _id: 'demo-spot-huangxing',
    name: '黄兴路步行街',
    latitude: 28.1956,
    longitude: 112.9693,
    cover,
    image: cover,
    address: '长沙市天心区黄兴南路',
    description: '霓虹、人流、街头小吃和长沙夜生活，适合闺蜜街拍和高节奏短视频。',
    tags: ['步行街', '夜景', '烟火气'],
    styles: ['霓虹', '街头', '短视频'],
    hotScore: 9.4,
    checkinCount: 1030,
    rating: '4.8',
    seriesCount: 3
  },
  {
    _id: 'demo-spot-yuelu',
    name: '岳麓山',
    latitude: 28.1843,
    longitude: 112.9183,
    cover: coverAlt,
    image: coverAlt,
    address: '长沙市岳麓区登高路',
    description: '自然光、林荫路和城市漫步感，适合亲子、情侣和轻写真。',
    tags: ['自然', '亲子', '漫步'],
    styles: ['自然光', '家庭', '旅行感'],
    hotScore: 9.1,
    checkinCount: 780,
    rating: '4.7',
    seriesCount: 2
  },
  {
    _id: 'demo-spot-xiezilong',
    name: '谢子龙影像艺术馆',
    latitude: 28.1792,
    longitude: 112.9438,
    cover,
    image: cover,
    address: '长沙市岳麓区潇湘南路',
    description: '建筑线条干净高级，适合极简写真、情侣大片和艺术感短片。',
    tags: ['艺术馆', '建筑', '高级感'],
    styles: ['极简', '艺术感', '大片'],
    hotScore: 9.0,
    checkinCount: 620,
    rating: '4.7',
    seriesCount: 2
  },
  {
    _id: 'demo-spot-qiatongxue',
    name: '恰同学少年广场',
    latitude: 28.1638,
    longitude: 112.9648,
    cover,
    image: cover,
    address: '长沙市天心区湘江中路（碧沙湖地铁站5号口）',
    description: '湘江边的免费观景平台，可同框橘子洲青年毛泽东雕像、岳麓山与湘江，红墙题字和滨江挑台适合国风、情侣和日落大片。',
    tags: ['江景', '观景台', '日落'],
    styles: ['国风', '江景', '日落'],
    hotScore: 9.2,
    checkinCount: 540,
    rating: '4.7',
    seriesCount: 2
  },
  {
    _id: 'demo-spot-chinaknot',
    name: '梅溪湖中国结桥',
    latitude: 28.1882,
    longitude: 112.8858,
    cover: coverAlt,
    image: coverAlt,
    address: '长沙市岳麓区梅溪湖路龙王港风光带内（西侧）',
    description: '以中国传统中国结为灵感的红色立体步行桥，三条桥交织成飘带造型，任意角度都出片，适合建筑感、高级感和夜景短片。',
    tags: ['建筑', '网红桥', '夜景'],
    styles: ['建筑感', '高级感', '夜景'],
    hotScore: 9.2,
    checkinCount: 610,
    rating: '4.7',
    seriesCount: 2
  },
  {
    _id: 'demo-spot-fengying',
    name: '丰盈西里',
    latitude: 28.1922,
    longitude: 112.9798,
    cover,
    image: cover,
    address: '长沙市芙蓉区丰盈西里（IFS国金中心背后）',
    description: 'IFS背后的宝藏文艺老巷，苏式风格小店、涂墙打卡点和安静街角，适合闺蜜、复古和 citywalk 出片。',
    tags: ['老巷', '文艺', 'citywalk'],
    styles: ['复古', '文艺', '街拍'],
    hotScore: 8.9,
    checkinCount: 470,
    rating: '4.6',
    seriesCount: 2
  },
  {
    _id: 'demo-spot-chaozong',
    name: '潮宗街',
    latitude: 28.2032,
    longitude: 112.9735,
    cover: coverAlt,
    image: coverAlt,
    address: '长沙市开福区潮宗街',
    description: '长沙仅存的麻石老街之一，民国戏楼、教堂与潮店交织，复古与潮流碰撞，适合复古、街拍和人文纪实。',
    tags: ['老街', '麻石路', '文艺'],
    styles: ['复古', '人文', '街拍'],
    hotScore: 9.1,
    checkinCount: 650,
    rating: '4.7',
    seriesCount: 2
  },
  {
    _id: 'demo-spot-hnmuseum',
    name: '湖南省博物院',
    latitude: 28.212,
    longitude: 112.9935,
    cover,
    image: cover,
    address: '长沙市开福区东风路50号',
    description: '马王堆汉墓文物所在地，长沙文化地标，建筑大气、馆前广场和立柱适合高级感、建筑感和旅行纪念照。',
    tags: ['博物馆', '地标', '文化'],
    styles: ['高级感', '建筑感', '旅行'],
    hotScore: 9.3,
    checkinCount: 720,
    rating: '4.8',
    seriesCount: 2
  },
  {
    _id: 'demo-spot-tianxinge',
    name: '天心阁',
    latitude: 28.1835,
    longitude: 112.9815,
    cover: coverAlt,
    image: coverAlt,
    address: '长沙市天心区天心路4号',
    description: '长沙古城东南角上的朱梁画栋城楼，古建轮廓和城墙线条适合国风、古建写真和城市全景。',
    tags: ['古建', '城楼', '国风'],
    styles: ['国风', '古建', '夜景'],
    hotScore: 8.8,
    checkinCount: 430,
    rating: '4.6',
    seriesCount: 2
  },
  {
    _id: 'demo-spot-wenhexia',
    name: '超级文和友（海信广场店）',
    latitude: 28.1902,
    longitude: 112.9692,
    cover,
    image: cover,
    address: '长沙市天心区湘江中路36号海信广场',
    description: '复原老长沙街巷的复古空间，霓虹灯牌和怀旧场景非常适合赛博朋克、复古和暗调氛围写真。',
    tags: ['复古', '霓虹', '网红'],
    styles: ['复古', '赛博朋克', '氛围感'],
    hotScore: 9.4,
    checkinCount: 880,
    rating: '4.8',
    seriesCount: 3
  },
  {
    _id: 'demo-spot-meixi-art',
    name: '梅溪湖国际文化艺术中心',
    latitude: 28.1958,
    longitude: 112.9072,
    cover: coverAlt,
    image: coverAlt,
    address: '长沙市岳麓区梅溪湖路与节庆路交叉口',
    description: '扎哈·哈迪德设计的流线型“芙蓉花”建筑，白色曲面极简高级，适合极简、建筑感和艺术感大片。',
    tags: ['建筑', '艺术中心', '高级感'],
    styles: ['极简', '建筑感', '艺术感'],
    hotScore: 9.0,
    checkinCount: 560,
    rating: '4.7',
    seriesCount: 2
  },
  {
    _id: 'demo-spot-lizijian',
    name: '李自健美术馆',
    latitude: 28.1192,
    longitude: 112.949,
    cover,
    image: cover,
    address: '长沙市岳麓区潇湘南路一段385号',
    description: '湘江之滨的现代化公益美术馆，清水混凝土与水面倒影干净高级，适合极简、艺术感和亲子文化写真。',
    tags: ['美术馆', '建筑', '亲子'],
    styles: ['极简', '艺术感', '高级感'],
    hotScore: 8.9,
    checkinCount: 410,
    rating: '4.6',
    seriesCount: 2
  }
]

const series = [
  {
    _id: 'demo-series-dufu-night',
    name: '杜甫江阁夜景国风',
    cover,
    styles: ['国风', '夜景', '江景大片'],
    tags: ['照片系列', '国风'],
    intro: '围绕杜甫江阁、湘江夜景和古建灯光设计的一组照片系列。',
    spotIds: ['demo-spot-dufu'],
    packageIds: ['demo-pkg-dufu-photo'],
    productType: 'photo',
    soldCount: 186,
    minPrice: 459,
    maxPrice: 899
  },
  {
    _id: 'demo-series-city-cover',
    name: '长沙城市地标大片',
    cover: coverAlt,
    styles: ['地标大片', '高级街拍', '城市封面'],
    tags: ['照片系列', '地标'],
    intro: '用长沙地标和城市线条拍一组旅行封面。',
    spotIds: ['demo-spot-ifs', 'demo-spot-orange'],
    packageIds: ['demo-pkg-city-photo'],
    productType: 'photo',
    soldCount: 286,
    minPrice: 399,
    maxPrice: 699
  },
  {
    _id: 'demo-series-girl',
    name: '闺蜜轻写真',
    cover,
    styles: ['闺蜜', '轻松自然', '旅行感'],
    tags: ['照片系列', '闺蜜'],
    intro: '适合两到三人同行，把长沙旅行拍成一组自然相册。',
    spotIds: ['demo-spot-ifs', 'demo-spot-taiping', 'demo-spot-huangxing'],
    packageIds: ['demo-pkg-girl-photo'],
    productType: 'photo',
    soldCount: 168,
    minPrice: 499,
    maxPrice: 799
  },
  {
    _id: 'demo-series-family',
    name: '亲子旅行纪念',
    cover: coverAlt,
    styles: ['亲子', '自然光', '温暖纪实'],
    tags: ['照片系列', '亲子'],
    intro: '把一家人的长沙旅行变成温暖纪念照。',
    spotIds: ['demo-spot-orange', 'demo-spot-yuelu'],
    packageIds: ['demo-pkg-family-photo'],
    productType: 'photo',
    soldCount: 96,
    minPrice: 599,
    maxPrice: 599
  },
  {
    _id: 'demo-series-vlog',
    name: '长沙城市漫游短片',
    cover,
    styles: ['Vlog', '城市漫游', '旅行记录'],
    tags: ['短视频系列', 'Vlog'],
    intro: '把一天长沙旅行剪成一条适合朋友圈和小红书的短片。',
    spotIds: ['demo-spot-huangxing', 'demo-spot-ifs', 'demo-spot-dufu'],
    packageIds: [],
    productType: 'video',
    soldCount: 74,
    minPrice: 799,
    maxPrice: 1199
  },
  {
    _id: 'demo-series-art',
    name: '艺术馆高级感写真',
    cover: coverAlt,
    styles: ['极简', '建筑线条', '高级感'],
    tags: ['照片系列', '高级感'],
    intro: '适合喜欢干净画面、建筑线条和杂志感的游客。',
    spotIds: ['demo-spot-xiezilong', 'demo-spot-yuelu'],
    packageIds: ['demo-pkg-art-photo'],
    productType: 'photo',
    soldCount: 64,
    minPrice: 699,
    maxPrice: 899
  }
]

const packages = [
  {
    _id: 'demo-pkg-dufu-photo',
    seriesId: 'demo-series-dufu-night',
    spotId: 'demo-spot-dufu',
    spotIds: ['demo-spot-dufu'],
    name: '杜甫江阁夜景旅拍套餐',
    cover,
    price: 459,
    originalPrice: 699,
    serviceType: 'photo',
    productType: 'photo',
    isHot: true,
    isMainPush: true,
    isHotSale: true,
    hotScore: 96,
    duration: 80,
    retouchCount: 10,
    description: '适合国风、情侣和夜景大片，包含拍摄路线建议。',
    serviceTags: ['80分钟拍摄', '10张精修', '夜景推荐'],
    includedItems: [
      { type: 'album', name: '杜甫江阁夜景照片单品', cover, price: 99, target: { page: 'photoCollection', seriesId: 'demo-series-dufu-night', albumId: 'demo-album-dufu-night' } },
      { type: 'album', name: '杜甫江阁湘江夜色照片单品', cover: coverAlt, price: 109, target: { page: 'photoCollection', seriesId: 'demo-series-dufu-night', albumId: 'demo-album-dufu-river' } },
      { type: 'video', name: '杜甫江阁湘江夜景短片', cover: coverAlt, price: 299, target: { page: 'videoProductDetail', productId: 'demo-video-product-dufu', seriesId: 'demo-series-dufu-night', spotId: 'demo-spot-dufu' } },
      { type: 'peripheral', name: '旅拍精装相册', cover, price: 99, target: { page: 'peripheral', peripheralId: 'demo-peripheral-album' } }
    ]
  },
  {
    _id: 'demo-pkg-city-photo',
    seriesId: 'demo-series-city-cover',
    spotId: 'demo-spot-ifs',
    spotIds: ['demo-spot-ifs', 'demo-spot-orange'],
    name: '城市地标写真1小时',
    cover: coverAlt,
    price: 399,
    originalPrice: 599,
    serviceType: 'photo',
    productType: 'photo',
    isHot: true,
    isMainPush: true,
    hotScore: 98,
    duration: 60,
    retouchCount: 9,
    description: '适合单人、情侣、闺蜜，覆盖1个热门打卡点。',
    serviceTags: ['1小时拍摄', '9张精修', '适合游客'],
    includedItems: [
      { type: 'album', name: '城市地标封面样片', cover: coverAlt, price: 99, target: { page: 'photoCollection', seriesId: 'demo-series-city-cover', albumId: 'demo-album-city-cover' } },
      { type: 'album', name: 'IFS夜景地标大片照片单品', cover, price: 99, target: { page: 'photoCollection', seriesId: 'demo-series-city-cover', albumId: 'demo-album-city-ifs-night' } },
      { type: 'video', name: 'IFS城市高光短片', cover, price: 269, target: { page: 'videoProductDetail', productId: 'demo-video-product-ifs', seriesId: 'demo-series-city-cover', spotId: 'demo-spot-ifs' } }
    ]
  },
  {
    _id: 'demo-pkg-girl-photo',
    seriesId: 'demo-series-girl',
    spotId: 'demo-spot-taiping',
    spotIds: ['demo-spot-taiping', 'demo-spot-ifs', 'demo-spot-huangxing'],
    name: '闺蜜双人旅拍套餐',
    cover,
    price: 499,
    originalPrice: 699,
    serviceType: 'photo',
    productType: 'photo',
    isHot: true,
    hotScore: 94,
    duration: 90,
    retouchCount: 12,
    description: '适合两位女生同行，轻松自然，有长沙旅行感。',
    serviceTags: ['双人可拍', '12张精修', '路线建议']
  },
  {
    _id: 'demo-pkg-family-photo',
    seriesId: 'demo-series-family',
    spotId: 'demo-spot-orange',
    spotIds: ['demo-spot-orange', 'demo-spot-yuelu'],
    name: '亲子家庭纪念套餐',
    cover: coverAlt,
    price: 599,
    originalPrice: 799,
    serviceType: 'photo',
    productType: 'photo',
    isHot: false,
    hotScore: 88,
    duration: 90,
    retouchCount: 15,
    description: '适合亲子、家庭游客，记录自然互动和旅行纪念。',
    serviceTags: ['家庭友好', '15张精修', '轻纪实']
  },
  {
    _id: 'demo-pkg-art-photo',
    seriesId: 'demo-series-art',
    spotId: 'demo-spot-xiezilong',
    spotIds: ['demo-spot-xiezilong', 'demo-spot-yuelu'],
    name: '艺术馆高级感写真',
    cover: coverAlt,
    price: 699,
    originalPrice: 899,
    serviceType: 'photo',
    productType: 'photo',
    isHot: false,
    hotScore: 86,
    duration: 90,
    retouchCount: 12,
    description: '适合极简、高级感、建筑线条主题写真。',
    serviceTags: ['高级感', '12张精修', '建筑大片']
  }
]

const albums = [
  { _id: 'demo-album-dufu-night', seriesId: 'demo-series-dufu-night', name: '杜甫江阁夜景照片单品', isHotSale: true, cover, price: 99, photoCount: 18, sampleUrls: sampleNine, shootingNotes: '建议晚上7点后拍摄，古建灯光与湘江夜色同框最出片；服装可选黑、红、白或国风元素。' },
  { _id: 'demo-album-dufu-hanfu', seriesId: 'demo-series-dufu-night', name: '湘江国风同款样片', cover: coverAlt, price: 129, photoCount: 16, sampleUrls: sampleNine, shootingNotes: '国风写真建议搭配汉服或素色长裙，江边逆光时段（傍晚）人物轮廓感最强。' },
  { _id: 'demo-album-city-cover', seriesId: 'demo-series-city-cover', name: '城市地标封面样片', cover: coverAlt, price: 99, photoCount: 20, sampleUrls: sampleNine, shootingNotes: '城市封面适合上午或傍晚的斜射光，建筑线条更立体；可带墨镜、咖啡等小道具增加氛围。' },
  { _id: 'demo-album-girl', seriesId: 'demo-series-girl', name: '闺蜜轻写真照片单品', cover, price: 99, photoCount: 16, sampleUrls: sampleNine, shootingNotes: '闺蜜轻写真以自然互动为主，不需刻意摆拍；建议穿同色系或互补色服装更上镜。' },
  { _id: 'demo-album-family', seriesId: 'demo-series-family', name: '亲子旅行纪念样片', cover: coverAlt, price: 99, photoCount: 15, sampleUrls: sampleNine, shootingNotes: '亲子拍摄建议下午4点后光线更柔和，让孩子先自由玩耍再引导抓拍自然瞬间。' },
  { _id: 'demo-album-vlog', seriesId: 'demo-series-vlog', name: '城市漫游短片分镜照片单品', cover, price: 129, photoCount: 12, sampleUrls: sampleNine, shootingNotes: '短视频建议边走边拍，回头、穿过人群等动作让成片更真实；晚上7点后霓虹氛围最佳。' },
  { _id: 'demo-album-art-minimal', seriesId: 'demo-series-art', name: '艺术馆极简写真样片', cover: coverAlt, price: 139, photoCount: 16, sampleUrls: sampleNine, shootingNotes: '艺术馆内请保持安静，利用留白墙面与建筑线条构图；浅色或极简穿搭更出片。' },
  { _id: 'demo-album-dufu-river', seriesId: 'demo-series-dufu-night', name: '杜甫江阁湘江夜色照片单品', cover: coverAlt, price: 109, photoCount: 21, sampleUrls: sampleNine, shootingNotes: '夜景合集以灯光层次为主，建议带补光或选择有灯位的机位；红、白色服装对比更突出。' },
  { _id: 'demo-album-dufu-couple', seriesId: 'demo-series-dufu-night', name: '杜甫江阁情侣夜景样片', cover, price: 119, photoCount: 18, sampleUrls: sampleNine, shootingNotes: '情侣夜景建议互动自然，牵手、倚栏即可；黑色或红色服装在夜景中更显气质。' },
  { _id: 'demo-album-city-ifs-night', seriesId: 'demo-series-city-cover', name: 'IFS夜景地标大片照片单品', cover, price: 99, photoCount: 22, sampleUrls: sampleNine, shootingNotes: 'IFS夜景建议晚上7点后，利用商场灯光与玻璃幕墙反光；亮色服装更吸睛。' },
  { _id: 'demo-album-city-orange-skyline', seriesId: 'demo-series-city-cover', name: '橘子洲城市天际线样片', cover: coverAlt, price: 109, photoCount: 20, sampleUrls: sampleNine, shootingNotes: '天际线适合日落前后（蓝调时刻）拍摄，江边开阔机位能同时收进城市轮廓。' },
  { _id: 'demo-album-girl-taiping', seriesId: 'demo-series-girl', name: '太平老街闺蜜轻写真', cover: coverAlt, price: 99, photoCount: 18, sampleUrls: sampleNine, shootingNotes: '老街复古质感强，建议穿复古或旗袍风格；午后人流较少，更容易拍出干净画面。' },
  { _id: 'demo-album-girl-huangxing', seriesId: 'demo-series-girl', name: '黄兴路夜游闺蜜样片', cover: coverAlt, price: 119, photoCount: 16, sampleUrls: sampleNine, shootingNotes: '夜游街拍建议晚上进行，霓虹灯牌是天然背景；可带奶茶、小吃增加生活感。' },
  { _id: 'demo-album-family-orange-lawn', seriesId: 'demo-series-family', name: '橘子洲草坪亲子样片', cover, price: 99, photoCount: 18, sampleUrls: sampleNine, shootingNotes: '草坪亲子建议晴天上午，光线通透、草地更绿；穿浅色或亮色服装与孩子更搭。' },
  { _id: 'demo-album-vlog-night', seriesId: 'demo-series-vlog', name: '黄兴路夜游短片分镜', cover: coverAlt, price: 129, photoCount: 15, sampleUrls: sampleNine, shootingNotes: '夜游短片以霓虹和人流为主，边走边拍最自然；建议晚上7点后出发，氛围最完整。' },
  { _id: 'demo-album-vlog-citywalk', seriesId: 'demo-series-vlog', name: '长沙城市漫游分镜照片单品', cover, price: 129, photoCount: 18, sampleUrls: sampleNine, shootingNotes: 'Citywalk 短片节奏轻松，建议从地标串联到街巷；白天夜晚各拍一段对比更有层次。' }
]

const photos = albums.flatMap(album => album.sampleUrls.map((url, index) => ({
  _id: `${album._id}-photo-${index + 1}`,
  seriesId: album.seriesId,
  albumId: album._id,
  url,
  type: 'image'
})))

const videos = [
  { _id: 'demo-video-dufu', seriesId: 'demo-series-dufu-night', spotId: 'demo-spot-dufu', title: '杜甫江阁湘江夜景短片', cover: coverAlt, url: DEMO_VIDEO_URL, videoUrl: DEMO_VIDEO_URL, previewVideoUrl: DEMO_VIDEO_URL, type: 'video', durationText: '60秒', spotName: '杜甫江阁' },
  { _id: 'demo-video-ifs', seriesId: 'demo-series-city-cover', spotId: 'demo-spot-ifs', title: 'IFS城市高光短片', cover, url: DEMO_VIDEO_URL, videoUrl: DEMO_VIDEO_URL, previewVideoUrl: DEMO_VIDEO_URL, type: 'video', durationText: '45秒', spotName: 'IFS国金中心' },
  { _id: 'demo-video-girl', seriesId: 'demo-series-girl', spotId: 'demo-spot-huangxing', title: '闺蜜夜游长沙短片', cover: coverAlt, url: DEMO_VIDEO_URL, videoUrl: DEMO_VIDEO_URL, previewVideoUrl: DEMO_VIDEO_URL, type: 'video', durationText: '60秒', spotName: '黄兴路步行街' },
  { _id: 'demo-video-vlog', seriesId: 'demo-series-vlog', spotId: 'demo-spot-huangxing', title: '长沙城市漫游Vlog', cover, url: DEMO_VIDEO_URL, videoUrl: DEMO_VIDEO_URL, previewVideoUrl: DEMO_VIDEO_URL, type: 'video', durationText: '60秒', spotName: '黄兴路步行街' },
  { _id: 'demo-video-orange', seriesId: 'demo-series-city-cover', spotId: 'demo-spot-orange', title: '橘子洲落日江景短片', cover: coverAlt, url: DEMO_VIDEO_URL, videoUrl: DEMO_VIDEO_URL, previewVideoUrl: DEMO_VIDEO_URL, type: 'video', durationText: '45秒', spotName: '橘子洲' },
  { _id: 'demo-video-taiping', seriesId: 'demo-series-girl', spotId: 'demo-spot-taiping', title: '太平老街复古漫游短片', cover, url: DEMO_VIDEO_URL, videoUrl: DEMO_VIDEO_URL, previewVideoUrl: DEMO_VIDEO_URL, type: 'video', durationText: '50秒', spotName: '太平老街' }
]

const videoProducts = videos.map((item, index) => ({
  _id: item._id.replace('demo-video-', 'demo-video-product-'),
  videoId: item._id,
  seriesId: item.seriesId,
  spotId: item.spotId,
  spotIds: [item.spotId],
  name: item.title,
  cover: item.cover,
  videoUrl: item.videoUrl,
  previewVideoUrl: item.previewVideoUrl,
  price: [299, 269, 329, 399, 299, 289][index] || 299,
  originalPrice: [399, 369, 459, 599, 399, 389][index] || 399,
  serviceType: 'video',
  productType: 'video',
  productKind: 'video_single',
  type: 'video',
  isHot: true,
  isMainPush: index < 3,
  isHotSale: index === 0,
  hotScore: 99 - index,
  videoDuration: item.durationText,
  finishedVideoCount: '1条短视频',
  fullEdit: true,
  hasAerial: false,
  deliveryCycle: '2-3个工作日',
  description: `${item.spotName}单条短视频商品，适合已经确定风格的游客快速预约。`,
  serviceTags: ['短视频单品', '独立商品', '可预约'],
  giftItems: ['短视频封面图1张']
}))

// 给每个短视频商品附带“套餐包含”演示数据（混合：单品视频成片 + 同系列照片单品 + 周边）
const albumBySeries = {
  'demo-series-dufu-night': { albumId: 'demo-album-dufu-night', name: '杜甫江阁夜景照片单品' },
  'demo-series-city-cover': { albumId: 'demo-album-city-cover', name: '城市地标封面样片' },
  'demo-series-girl': { albumId: 'demo-album-girl', name: '闺蜜轻写真照片单品' },
  'demo-series-vlog': { albumId: 'demo-album-vlog', name: '城市漫游短片分镜照片单品' }
}
videoProducts.forEach((p) => {
  const album = albumBySeries[p.seriesId] || { albumId: 'demo-album-dufu-night', name: '杜甫江阁夜景照片单品' }
  p.includedItems = [
    { type: 'video', name: `${p.name}成片`, cover: p.cover, price: p.price, target: { page: 'videoProductDetail', productId: p._id, seriesId: p.seriesId, spotId: p.spotId } },
    { type: 'album', name: album.name, cover, price: 99, target: { page: 'photoCollection', seriesId: p.seriesId, albumId: album.albumId } },
    { type: 'peripheral', name: '短视频封面精修', cover: coverAlt, price: 29, target: { page: 'peripheral', peripheralId: 'demo-peripheral-video-cover' } }
  ]
})

// 给未配置 includedItems 的套餐补全演示数据，便于 seriesDetail 展示“套餐包含”清单
packages.forEach((p) => {
  if (p.includedItems && p.includedItems.length) return
  const album = albumBySeries[p.seriesId] || { albumId: 'demo-album-dufu-night', name: '杜甫江阁夜景照片单品' }
  const isVideo = p.serviceType === 'video' || p.type === 'video'
  const items = [
    { type: 'album', name: album.name, cover, price: 99, target: { page: 'photoCollection', seriesId: p.seriesId, albumId: album.albumId } }
  ]
  if (isVideo) {
    const vid = videoProducts.find(v => v.seriesId === p.seriesId)
    items.unshift({ type: 'video', name: `${p.name}成片`, cover: p.cover, price: vid ? vid.price : 0, target: { page: 'videoProductDetail', productId: vid ? vid._id : '', seriesId: p.seriesId, spotId: p.spotId } })
  }
  items.push({ type: 'peripheral', name: '旅拍精装相册', cover, price: 99, target: { page: 'peripheral', peripheralId: 'demo-peripheral-album' } })
  p.includedItems = items
})

const guides = [
  {
    _id: 'demo-guide-dufu-night',
    title: '杜甫江阁夜景国风拍摄攻略',
    description: '湘江、古建和灯光叠在一起，适合国风与夜景情侣照。',
    image: cover, coverUrl: cover,
    spotId: 'demo-spot-dufu', spotName: '杜甫江阁', seriesId: 'demo-series-dufu-night',
    isHot: true, readCount: 1206, score: '4.9', targetPackageId: 'demo-pkg-dufu-photo',
    content: [
      '想拍出杜甫江阁的夜景国风感，关键是 timing：建议在日落前 40 分钟到达，先拍蓝调天空下的古建轮廓，再等华灯初上抓灯光与江面倒影。',
      '机位推荐：阁楼正前方的亲水步道视野最全；想拍人像特写，可借隔江的护栏做前景，把江面光斑虚化成背景。',
      '穿搭建议：红、墨绿或米白系国风裙最出片；避免大面积荧光色，会和暖黄灯光打架。'
    ]
  },
  {
    _id: 'demo-guide-ifs-night',
    title: 'IFS城市地标旅拍路线',
    description: '从国金中心到解放西，适合城市封面、夜景短视频和闺蜜街拍。',
    image: coverAlt, coverUrl: coverAlt,
    spotId: 'demo-spot-ifs', spotName: 'IFS国金中心', seriesId: 'demo-series-city-cover',
    isHot: true, readCount: 1288, score: '4.9', targetPackageId: 'demo-pkg-city-photo',
    content: [
      '路线：从 IFS 国金中心 KAWS 雕塑开始，沿黄兴南路步行到解放西，一路霓虹和商场橱窗都适合做城市封面。',
      '拍摄技巧：用长焦压缩背景，把人流虚化成流动的光带；想拍干净的城市天际线，可找商场高层落地窗借位。',
      '闺蜜街拍：两人可一前一后错位站，利用橱窗反射做对称构图，自带故事感。'
    ]
  },
  {
    _id: 'demo-guide-orange-family',
    title: '橘子洲亲子旅拍机位',
    description: '江景、草坪和城市天际线都适合自然轻松的家庭纪念照。',
    image: cover, coverUrl: cover,
    spotId: 'demo-spot-orange', spotName: '橘子洲', seriesId: 'demo-series-family',
    readCount: 936, score: '4.8', targetPackageId: 'demo-pkg-family-photo',
    content: [
      '最佳时段：上午 9 点前或下午 4 点后，光线柔和、游客也少，孩子状态更放松。',
      '机位推荐：沿江草坪开阔、颜色干净，适合全家奔跑抓拍；青年毛泽东雕像广场适合拍"到此一游"式纪念照。',
      '亲子互动：让孩子追泡泡、踩落叶，比摆拍更自然；家长蹲下与孩子平视，构图更亲切。'
    ]
  },
  {
    _id: 'demo-guide-huangxing-video',
    title: '黄兴路夜景短视频路线',
    description: '霓虹、街头人流和长沙烟火气，是短视频最有记忆点的部分。',
    image: coverAlt, coverUrl: coverAlt,
    spotId: 'demo-spot-huangxing', spotName: '黄兴路步行街', seriesId: 'demo-series-vlog',
    isHot: true, readCount: 1106, score: '4.9', targetPackageId: 'demo-pkg-girl-photo',
    content: [
      '路线：黄兴路步行街全程约 800 米，从南门口吃到解放西，街边霓虹和老字号招牌都是现成的取景框。',
      '运镜建议：手持慢推 + 偶尔仰拍楼体灯光，制造沉浸的"夜长沙"氛围；遇到耍猴、卖艺可抓拍，烟火气最足。',
      '收音：街边嘈杂，建议后期配轻快 BGM，人声旁白压低，突出节奏感。'
    ]
  },
  {
    _id: 'demo-guide-xiezilong-art',
    title: '谢子龙艺术馆高级感机位',
    description: '干净墙面、建筑线条和留白构图，适合极简写真和情侣大片。',
    image: cover, coverUrl: cover,
    spotId: 'demo-spot-xiezilong', spotName: '谢子龙影像艺术馆', seriesId: 'demo-series-art',
    readCount: 588, score: '4.8', targetPackageId: 'demo-pkg-art-photo',
    content: [
      '建筑本身就是最佳背景：白色清水墙、斜向连廊和几何天窗，适合极简留白构图。',
      '机位推荐：中庭大台阶做对称构图；连廊尽头借自然光做逆光剪影，高级感拉满。',
      '穿搭建议：黑白灰或低饱和色最稳；情侣可同色系不同深浅，画面更统一。'
    ]
  }
]

const peripherals = [
  { _id: 'demo-peripheral-album', name: '旅拍精装相册', cate: '相册', category: '相册', image: cover, cover, price: 99, storeProductId: '10001778657765', isHot: true, isHotSale: true, description: '适合把本次旅拍成片做成纪念相册。', specs: ['A4/A5', '硬壳', '皮面'], images: [cover, coverAlt, coverFallback] },
  { _id: 'demo-peripheral-frame', name: '城市封面装裱', cate: '相框', category: '相框', image: cover, cover, price: 129, storeProductId: '10001778528683', isHot: true, description: '适合地标大片和情侣纪念照装裱。', specs: ['实木', 'A3/A4', '立式'], images: [cover, coverAlt] },
  { _id: 'demo-peripheral-print', name: '高清照片冲印', cate: '打印', category: '打印', image: coverAlt, cover: coverAlt, price: 39, description: '精选照片高清冲印，可搭配旅拍订单咨询。', specs: ['哑光', '亮面', 'A4'], images: [coverAlt, cover] },
  { _id: 'demo-peripheral-fridge', name: 'DIY 冰箱贴', cate: '冰箱贴', category: '冰箱贴', image: cover, cover, price: 29, isNew: true, description: '把旅拍瞬间做成磁性冰箱贴，随手贴。', specs: ['磁性', '圆/方', '定制图'], images: [cover, coverAlt] },
  { _id: 'demo-peripheral-acrylic', name: '立体亚克力摆件', cate: '亚克力', category: '亚克力', image: coverAlt, cover: coverAlt, price: 89, isHot: true, description: 'UV 打印立体摆件，桌面小风景。', specs: ['圆/方', 'UV打印', '立式'], images: [coverAlt, coverFallback] },
  { _id: 'demo-peripheral-3d', name: '3D 水晶摆件', cate: '3D', category: '3D', image: cover, cover, price: 159, isNew: true, description: '悬浮水晶内雕，光影感纪念品。', specs: ['水晶', '悬浮', 'LED'], images: [cover, coverAlt] }
]

const orders = [
  {
    _id: 'demo-order-pending',
    orderNo: 'LXM202607080001',
    status: 'pending',
    customerStatus: '待确认',
    packageName: '杜甫江阁夜景旅拍套餐',
    packagePrice: 459,
    totalPrice: 459,
    spotName: '杜甫江阁',
    seriesName: '杜甫江阁夜景国风',
    date: '2026-07-08',
    timePeriod: '19:00-20:20',
    type: 'photo',
    contactName: '旅拍用户',
    contactPhone: '13800000000',
    contactWechat: 'luxiaoming',
    items: [{ spotId: 'demo-spot-dufu', spotName: '杜甫江阁', seriesId: 'demo-series-dufu-night', seriesName: '杜甫江阁夜景国风', packageId: 'demo-pkg-dufu-photo', packageName: '杜甫江阁夜景旅拍套餐', price: 459 }]
  },
  {
    _id: 'demo-order-completed',
    orderNo: 'LXM202607030002',
    status: 'delivered',
    customerStatus: '已完成',
    packageName: '城市地标写真1小时',
    packagePrice: 399,
    totalPrice: 399,
    spotName: 'IFS国金中心',
    seriesName: '长沙城市地标大片',
    date: '2026-07-03',
    timePeriod: '19:30-21:00',
    type: 'photo',
    contactName: '旅拍用户',
    contactPhone: '13800000000',
    deliverFiles: [{ url: cover }, { url: coverAlt }, { url: coverFallback }]
  },
  {
    _id: 'demo-order-shooting',
    orderNo: 'LXM202607060003',
    status: 'shooting',
    customerStatus: '拍摄中',
    packageName: '闺蜜双人旅拍套餐',
    packagePrice: 499,
    totalPrice: 499,
    spotName: '太平老街',
    seriesName: '闺蜜轻写真',
    date: '2026-07-06',
    timePeriod: '15:00-16:30',
    type: 'photo',
    contactName: '旅拍用户',
    contactPhone: '13800000000'
  },
  {
    _id: 'demo-order-editing',
    orderNo: 'LXM202607050004',
    status: 'editing',
    customerStatus: '修片中',
    packageName: '城市地标写真1小时',
    packagePrice: 399,
    totalPrice: 399,
    spotName: 'IFS国金中心',
    seriesName: '长沙城市地标大片',
    date: '2026-07-05',
    timePeriod: '18:00-19:00',
    type: 'photo',
    contactName: '旅拍用户',
    contactPhone: '13800000000'
  }
]

function findSeries(seriesId) {
  return series.find(item => item._id === seriesId) || series[0]
}

function findSeriesBySpot(spotId) {
  if (!spotId) return null
  return series.find(item => (item.spotIds || []).includes(spotId)) || null
}

function getHomeData() {
  return {
    shopInfo: { name: '麓小鸣城市旅拍' },
    activityText: '长沙旅拍预约中 | 地标写真、闺蜜写真、亲子旅拍、夜景短视频',
    banners: [
      { _id: 'demo-banner-1', type: 'image', url: cover, targetType: 'spot', targetId: 'demo-spot-dufu' },
      { _id: 'demo-banner-2', type: 'image', url: coverAlt, targetType: 'explore' },
      { _id: 'demo-banner-3', type: 'image', url: coverFallback, targetType: 'booking' }
    ],
    spots,
    series,
    guides,
    packages,
    videoProducts,
    albums,
    peripherals,
    videos
  }
}

// 探索页轮播兜底（后台未配置时显示）：与首页轮播「单独一套」，这里只用品牌文案占位
const exploreBanners = [
  { _id: 'demo-exp-1', type: 'image', url: cover, title: '麓小鸣，记录城市与你的故事', targetType: 'none', targetId: '', linkUrl: '' },
  { _id: 'demo-exp-2', type: 'image', url: coverAlt, title: '长沙旅拍样片持续上新中', targetType: 'none', targetId: '', linkUrl: '' },
  { _id: 'demo-exp-3', type: 'image', url: coverFallback, title: '新客首单立减 ¥30', targetType: 'none', targetId: '', linkUrl: '' }
]

function getPhotoCollection({ seriesId = '', albumId = '', spotId = '' } = {}) {
  const currentAlbum = albumId ? albums.find(item => item._id === albumId || item.albumId === albumId) : null
  const currentSeries = currentAlbum ? findSeries(currentAlbum.seriesId) : (seriesId ? findSeries(seriesId) : (findSeriesBySpot(spotId) || findSeries(seriesId)))
  const relatedSpots = spots.filter(item => (currentSeries.spotIds || []).includes(item._id))
  const currentSpotId = spotId || (currentAlbum && currentAlbum.spotId) || (relatedSpots[0] && relatedSpots[0]._id) || ''
  const relatedPhotos = photos.filter(item => item.seriesId === currentSeries._id)
  const seriesVideos = videos.filter(item => item.seriesId === currentSeries._id)
  const relatedVideos = currentSpotId
    ? seriesVideos.filter(item => item.spotId === currentSpotId || (Array.isArray(item.spotIds) && item.spotIds.includes(currentSpotId)))
    : seriesVideos
  const relatedPackages = packages.filter(item => item.seriesId === currentSeries._id || (currentSeries.packageIds || []).includes(item._id))
  const featuredPackages = relatedPackages.filter(item => item.isMainPush || item.isHot)
  const collections = albums
    .filter(item => item.seriesId === currentSeries._id)
    .map(item => ({
      ...item,
      albumId: item._id,
      spotId: currentSpotId,
      spotName: (spots.find(spot => spot._id === currentSpotId) || relatedSpots[0] || {}).name,
      seriesName: currentSeries.name,
      intro: currentSeries.intro,
      coverImage: item.cover || cover,
      sampleUrls: item.sampleUrls || [item.cover || cover]
    }))

  return {
    series: {
      ...currentSeries,
      samples: [
        ...(relatedPhotos.length ? relatedPhotos.slice(0, 4) : [{ _id: 'demo-cover', url: currentSeries.cover || cover, type: 'image' }]),
        ...relatedVideos.slice(0, 1)
      ],
      spots: relatedSpots
    },
    photos: relatedPhotos.length ? relatedPhotos : [{ _id: 'demo-cover', seriesId: currentSeries._id, url: currentSeries.cover || cover, type: 'image' }],
    currentSpotId,
    videos: relatedVideos,
    packages: relatedPackages,
    featuredPackages,
    spotPackages: relatedPackages,
    peripherals: peripherals.slice(0, 5),
    collections,
    currentCollection: currentAlbum || collections[0]
  }
}

function getBookingData() {
  return {
    spots,
    allSeries: series.map(item => ({
      ...item,
      packageCount: packages.filter(pkg => pkg.seriesId === item._id).length,
      albumCount: albums.filter(album => album.seriesId === item._id).length,
      firstSpotName: (spots.find(spot => (item.spotIds || []).includes(spot._id)) || {}).name || ''
    })),
    albums,
    hotPackages: packages.filter(item => item.isHot),
    allPackages: [...videoProducts, ...packages]
  }
}

function getSeriesDetail({ seriesId = '', packageId = '', spotId = '' } = {}) {
  const allVideoAndPackageProducts = [...videoProducts, ...packages]
  const currentPackage = allVideoAndPackageProducts.find(item => item._id === packageId)
  const resolvedSeriesId = seriesId || (currentPackage && currentPackage.seriesId) || 'demo-series-dufu-night'
  const currentSeries = findSeries(resolvedSeriesId)
  const currentSpotId = spotId || (currentPackage && currentPackage.spotId) || currentSeries.spotIds[0]
  const relatedSpots = spots.filter(item => (currentSeries.spotIds || []).includes(item._id))
  const relatedPackages = allVideoAndPackageProducts.filter(item => item.seriesId === currentSeries._id || item.spotId === currentSpotId || (Array.isArray(item.spotIds) && item.spotIds.includes(currentSpotId)))
  const relatedVideos = videos.filter(item => item.seriesId === currentSeries._id || item.spotId === currentSpotId)
  const mainPushPackages = relatedPackages.filter(item => item.isMainPush || item.isHot)
  const mainPushIds = mainPushPackages.map(item => item._id)
  const isVideoDetail = currentPackage && (currentPackage.serviceType === 'video' || currentPackage.productType === 'video' || currentPackage.type === 'video')
  const otherDemoVideos = videos.filter(item => !relatedVideos.includes(item))
  const recommendedVideos = isVideoDetail ? [...relatedVideos, ...otherDemoVideos].slice(0, 6) : []
  // 构造轮播样片：视频套餐优先从套餐包含商品中抽取视频+照片，再补充相关视频/照片
  let heroSamples = []
  if (isVideoDetail && currentPackage && currentPackage.includedItems && currentPackage.includedItems.length) {
    heroSamples = currentPackage.includedItems.map(item => {
      if (item.type === 'video') {
        const vid = videoProducts.find(v => v._id === (item.target && item.target.productId)) || videoProducts.find(v => v.seriesId === currentSeries._id)
        if (vid) {
          return { _id: `inc-video-${vid._id}`, type: 'video', url: vid.videoUrl || vid.previewVideoUrl || DEMO_VIDEO_URL, cover: item.cover || vid.cover || cover }
        }
      }
      if (item.type === 'album') {
        const alb = albums.find(a => a._id === (item.target && item.target.albumId))
        if (alb) {
          return { _id: `inc-album-${alb._id}`, type: 'image', url: alb.cover || item.cover || cover, cover: alb.cover || item.cover || cover }
        }
      }
      return null
    }).filter(Boolean)
  }
  if (isVideoDetail && heroSamples.length < 3 && relatedVideos.length) {
    const existedIds = new Set(heroSamples.map(s => s._id))
    relatedVideos.forEach(item => {
      const id = `rel-video-${item._id}`
      if (existedIds.has(id)) return
      existedIds.add(id)
      heroSamples.push({ _id: id, type: 'video', url: item.videoUrl || item.previewVideoUrl || DEMO_VIDEO_URL, cover: item.cover || cover })
    })
  }
  if (!isVideoDetail || !heroSamples.length) {
    heroSamples = photos.filter(item => item.seriesId === currentSeries._id).slice(0, 6).map(item => ({ ...item, type: 'image', cover: item.url || cover }))
  }

  return {
    series: currentSeries,
    currentPackage: currentPackage || mainPushPackages[0] || relatedPackages[0],
    currentSpotId,
    spots: relatedSpots,
    samples: heroSamples.slice(0, 6),
    photos: photos.filter(item => item.seriesId === currentSeries._id),
    recommendedVideos,
    videos: relatedVideos.length ? relatedVideos : videos.filter(item => (currentSeries.spotIds || []).includes(item.spotId)).slice(0, 4),
    albums: albums.filter(item => item.seriesId === currentSeries._id),
    packages: relatedPackages,
    mainPushPackages,
    spotPackages: relatedPackages.filter(item => !mainPushIds.includes(item._id))
  }
}

// 统一为每个商品标注规范 category（单一真相源，覆盖兼容后台旧字段，不破坏既有引用）
;[albums, packages, videoProducts, peripherals].forEach(list => {
  ;(list || []).forEach(item => { item.category = resolveCategory(item) })
})

module.exports = {
  DEFAULT_SHOOTING_INSTRUCTIONS,
  cover,
  spots,
  series,
  packages,
  videoProducts,
  albums,
  photos,
  guides,
  peripherals,
  orders,
  videos,
  exploreBanners,
  getHomeData,
  getBookingData,
  getPhotoCollection,
  getSeriesDetail
}
