'use strict'

const config = require('config')
const fetch = require('node-fetch')
const filter = require('lodash.filter')
const includes = require('lodash.includes')
const uniq = require('lodash.uniq')
const inside = require('@turf/inside')
const turf = require('@turf/helpers')
const fs = require('fs-extra')

const generateFileName = () => (config.regions.join('-') || 'empty') + '.json'

const generateAreaList = () => {
	const germany = require('german-administrative-areas')

	const entities = []
	for(let level in germany){
		for(let element of germany[level]){
			if(element && element.type==='Feature') entities.push(element)
			if(element && element.type==='FeatureCollection') entities.push(...element.features)
		}
	}

	const list = []
	list.push(...filter(
		entities,
		(o) => (o.properties && includes(config.regions, o.properties.RS_0))
	))
	return list
}

const loadAreaList = () =>
	fs.readJson(generateFileName())
	.catch((err) => {
		const areaList = generateAreaList()
		fs.writeJson(generateFileName(), areaList)
		return areaList
	})

const inArea = (coords, areas) => areas.some((area) => inside(coords, area))

const getSensorDump = () =>
	fetch('https://api.luftdaten.info/static/v2/data.dust.min.json')
	.then((res) => res.json())

const getSensorIDs = () => {
	return Promise.all([
		loadAreaList(),
		getSensorDump()
	])
	.then(([areaList, sensorIDs]) =>
		filter(sensorIDs, (s) => inArea(
			turf.point([+s.location.longitude, +s.location.latitude]),
			areaList
		))
		.map((o) => o.sensor.id)
	)
	.then((e) => uniq(e.concat(config.sensors.map((e) => e.id))))
	.catch((e) => uniq(config.sensors.map((e) => e.id)))
}

module.exports = getSensorIDs
