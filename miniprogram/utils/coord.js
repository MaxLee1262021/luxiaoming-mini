// 中国地图坐标系转换工具
// 背景：微信小程序 <map> 组件使用 GCJ-02（国测局加密）坐标系。
// 但点位经纬度如果来自 GPS 原生 / 谷歌地图（WGS-84）或百度地图（BD-09），
// 直接画在微信地图上会整体偏移 300~700 米。本工具把各种坐标系统一转成 GCJ-02。
//
// ⚠️ 关键开关：DEFAULT_SPOT_COORD_TYPE
//    - 如果后台点位来自「高德/腾讯地图点选」或「微信地图」→ 保持 'gcj02'（默认，无需转换）
//    - 如果来自「手机GPS / 谷歌地图 / 苹果地图」→ 改成 'wgs84'
//    - 如果来自「百度地图」→ 改成 'bd09'
// 也可以在每条点位数据上单独带 coordType 字段覆盖此默认值（优先级更高）。

var PI = Math.PI
var A = 6378245.0 // 长半轴
var EE = 0.00669342162296594323 // 偏心率平方

// 点位坐标的默认来源（改这里即可全站纠正）
var DEFAULT_SPOT_COORD_TYPE = 'gcj02' // 'gcj02' | 'wgs84' | 'bd09'

function outOfChina(lat, lng) {
  return !(lng > 73.66 && lng < 135.05 && lat > 3.86 && lat < 53.55)
}

function transformLat(lng, lat) {
  var ret = -100 + 2 * lng + 3 * lat + 0.2 * lat * lat + 0.1 * lng * lat + 0.2 * Math.sqrt(Math.abs(lng))
  ret += (20 * Math.sin(6.0 * lng * PI) + 20 * Math.sin(2.0 * lng * PI)) * 2 / 3
  ret += (20 * Math.sin(lat * PI) + 40 * Math.sin(lat / 3 * PI)) * 2 / 3
  ret += (160 * Math.sin(lat / 12 * PI) + 320 * Math.sin(lat * PI / 30)) * 2 / 3
  return ret
}

function transformLng(lng, lat) {
  var ret = 300 + lng + 2 * lat + 0.1 * lng * lng + 0.1 * lng * lat + 0.1 * Math.sqrt(Math.abs(lng))
  ret += (20 * Math.sin(6.0 * lng * PI) + 20 * Math.sin(2.0 * lng * PI)) * 2 / 3
  ret += (20 * Math.sin(lng * PI) + 40 * Math.sin(lng / 3 * PI)) * 2 / 3
  ret += (150 * Math.sin(lng / 12 * PI) + 300 * Math.sin(lng / 30 * PI)) * 2 / 3
  return ret
}

// WGS-84 -> GCJ-02  (lng, lat) 顺序入参
function wgs84ToGcj02(lng, lat) {
  if (outOfChina(lat, lng)) return [lng, lat]
  var dLat = transformLat(lng - 105.0, lat - 35.0)
  var dLng = transformLng(lng - 105.0, lat - 35.0)
  var radLat = lat / 180.0 * PI
  var magic = Math.sin(radLat)
  magic = 1 - EE * magic * magic
  var sqrtMagic = Math.sqrt(magic)
  dLat = (dLat * 180.0) / ((A * (1 - EE)) / (magic * sqrtMagic) * PI)
  dLng = (dLng * 180.0) / (A / sqrtMagic * Math.cos(radLat) * PI)
  return [lng + dLng, lat + dLat]
}

// BD-09 -> GCJ-02  (lng, lat) 顺序入参
function bd09ToGcj02(lng, lat) {
  var x = lng - 0.0065
  var y = lat - 0.006
  var z = Math.sqrt(x * x + y * y) - 0.00002 * Math.sin(y * PI)
  var theta = Math.atan2(y, x) - 0.000003 * Math.cos(x * PI)
  return [z * Math.cos(theta), z * Math.sin(theta)]
}

// 把任意坐标系的点位经纬度统一转成 GCJ-02，供微信地图绘制
// @param {number} lat  纬度
// @param {number} lng  经度
// @param {string} from 来源坐标系：'gcj02' | 'wgs84' | 'bd09'，缺省用 DEFAULT_SPOT_COORD_TYPE
// @returns {{ latitude:number, longitude:number }}
function normalizeToGcj02(lat, lng, from) {
  var type = from || DEFAULT_SPOT_COORD_TYPE
  if (type === 'gcj02' || lat == null || lng == null) {
    return { latitude: lat, longitude: lng }
  }
  var result = type === 'bd09' ? bd09ToGcj02(lng, lat) : wgs84ToGcj02(lng, lat)
  return { latitude: result[1], longitude: result[0] }
}

module.exports = {
  DEFAULT_SPOT_COORD_TYPE: DEFAULT_SPOT_COORD_TYPE,
  normalizeToGcj02: normalizeToGcj02,
  wgs84ToGcj02: wgs84ToGcj02,
  bd09ToGcj02: bd09ToGcj02
}
