'use strict'

const config = require('config')
const fetch = require('node-fetch')
const filter = require('lodash.filter')
const sortBy = require('lodash.sortby')
const twitterClient = require('twit')
const getSensorIDs = require('./getSensorIDs')

const twitter = new twitterClient({
	consumer_key: config.twitter.key,
	consumer_secret: config.twitter.key_secret,
	access_token: config.twitter.token,
	access_token_secret: config.twitter.token_secret,
	timeout_ms: 60*1000
})

let currentIncident = {
	"PM10": null,
	"PM2.5": null
}

let sendTweet

if(config.debug){
	sendTweet = (message) => console.log(message)
	config.interval = 0.2
	for(let t in config.thresholds) config.thresholds[t] = 1
}
else{
	sendTweet = (message) => twitter.post('statuses/update', {status: message}, (e) => console.error(e))
}

console.log(config.interval)

const getSensorName = (id) => {
	const x = config.sensors.find((s) => s.id === id)
	if(x && x.name) return x.name
	return id
}

const fetchSensorData = (sensorIDs) => {
	// todo: queue?
	const requests = []
	for(let sensorID of sensorIDs){
		requests.push(
			fetch(`https://api.luftdaten.info/static/v1/sensor/${sensorID}/`)
			.then((res) => res.json())
			.then((res) => ({
				sensor: sensorID,
				values: {
					'PM10': filter(res[res.length-1].sensordatavalues, (o) => o.value_type==='P1')[0].value,
					'PM2.5': filter(res[res.length-1].sensordatavalues, (o) => o.value_type==='P2')[0].value
				}
			}))
			.catch((err) => ({sensor: sensorID, values: {'PM10': null, 'PM2.5': null}}))
		)
	}
	return Promise.all(requests)
}

const checkSensorData = (sensorData) => {
	for(let type of ['PM10', 'PM2.5']){
		const sortedData = sortBy(
			filter(sensorData, (o) => (o.values[type] || 0) > config.thresholds[type]),
			(o) => (-1) * o.values[type]
		)
		if(sortedData.length >= (config.sensorLimit || 1)){
			let sensorList
			if(sortedData.length > 3){
				sensorList = sortedData.slice(0, 3).map((o) => getSensorName(o.sensor)).join(', ') + `, +${sortedData.length-3}`
			}
			else{
				sensorList = sortedData.map((o) => getSensorName(o.sensor)).join(', ')
			}
			let message
			if(config.language === 'de'){
				let plural = 'bei Sensor'
				if(sortedData.length > 1) plural = 'bei den Sensoren'
				message = `Achtung! Hohe Feinstaubbelastung in ${config.regionName} ${plural} ${sensorList}! ${type} ${sortedData[sortedData.length-1].values[type]} µg/m³ an Sensor ${getSensorName(sortedData[sortedData.length-1].sensor)}.`
			}
			else{
				let plural = ''
				if(sortedData.length > 1) plural = 's'
				message = `Caution! High fine dust pollution in ${config.regionName} at sensor${plural} ${sensorList}! ${type} ${sortedData[sortedData.length-1].values[type]} µg/m³ at sensor ${getSensorName(sortedData[sortedData.length-1].sensor)}.`
			}
			if(!currentIncident[type] || currentIncident[type] + (config.interval * 60 * 1000) <= +(new Date())){
				currentIncident[type] = +new Date()
				sendTweet(message)
			}
		}
		else{
			currentIncident[type] = null
		}
	}
}

const check = () =>
	getSensorIDs()
	.then(fetchSensorData)
	.then(checkSensorData)
	.catch(console.error)

setInterval(() => check(), (config.interval / 12) * 60*1000)
