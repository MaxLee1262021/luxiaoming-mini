const booking = require('../miniprogram/utils/booking')
const result = booking.buildBookingPayload({ name:'测试', phone:'13800000000', date:'2026-10-20', time:'14:30', items:[{packageId:'p1', price:100}], participantCount:1 })
if (result.date !== '2026-10-20' || result.timePeriod !== '14:30') throw new Error('date/time payload missing')
console.log('booking date/time payload PASS')
