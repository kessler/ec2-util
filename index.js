const debug = require('debug')('kessler:ec2-util')
const resourceType = require('./resourceType')

module.exports = (ec2) => {

	return {
		findVpc,
		findSubnets,
		pickSubnet,
		findInstancesByTags,
		launchInstance
	}

	function findInstancesByTags(filterTags, callback) {
		let filterTagNames = Object.keys(filterTags)

		let mapper = tagName => {
			return { Name: `tag:${tagName}`, Values: [filterTags[tagName]] }
		}

		let params = { Filters: filterTagNames.map(mapper) }
		debug('findInstancesByTags(): filters => %o', params.Filters)

		ec2.describeInstances(params, (err, result) => {
			if (err) return callback(err)

			let reservations = result.Reservations

			if (reservations && reservations.length > 0) {
				let reducer = (arr, entry) => arr.concat(entry.Instances)
				let instances = result.Reservations.reduce(reducer, [])
				debug('findInstancesByTags(): found %d instances', instances.length)

				return callback(null, instances)
			}

			callback(null, [])
		})
	}

	function launchInstance({ vpcName, imageId, count = 1, tags = [], instanceType = 't2.nano', dryRun = false, iamProfile }, callback) {

		findVpc(vpcName, onFindVpc)

		function onFindVpc(err, vpc) {
			if (err) return callback(err)
			if (!vpc) return callback(new Error(`cannot find vpc "${vpcName}"`))

			findSubnets(vpc.VpcId, onFindSubnets)
		}

		function onFindSubnets(err, subnets) {
			if (err) return callback(err)
			if (subnets.length === 0) return callback(new Error(`no subnets in vpc "${vpcName}"`))

			let subnet = pickSubnet(subnets)

			if (!subnet) {
				return callback(new Error(`no available subnets in vpc "${vpcName}"`))
			}

			let params = {
				MaxCount: count,
				MinCount: count,
				ImageId: imageId,
				InstanceType: instanceType,
				TagSpecifications: createTagSpecifications(tags),
				SubnetId: subnet.SubnetId,
				DryRun: dryRun
			}

			if (iamProfile) {
				params.IamInstanceProfile = {
					Arn: iamProfile.arn,
					Name: iamProfile.name
				}
			}

			debug('launchInstance(): preparing to launch instance: %o', params)
			ec2.runInstances(params, onRunInstances)
		}

		function onRunInstances(err, result) {
			if (err) return callback(err)

			let instances = result.Instances
			if (!instances) return callback(new Error('something went wrong'))
			if (instances.length !== 1) return callback(new Error('something went wrong'))

			let instance = instances[0]

			return checkLaunchStatus()

			function checkLaunchStatus() {
				checkInstanceReady(instance.InstanceId, (err, data) => {
					if (err) return callback(err)
					let status = data.InstanceStatuses
					if (!status) throw new Error('something went wrong')
					if (status.length === 0) {
						debug('checking status in 1 sec...')
						return setTimeout(checkLaunchStatus, 1000)
					}
					debug('instance is running: %o', status[0])
					instance.status = status[0]
					callback(null, instance)
				})
			}
		}
	}

	function findVpc(name, callback) {
		debug('findVpc(%s)', name)

		ec2.describeVpcs((err, result) => {
			if (err) return callback(err)

			let vpcs = result.Vpcs

			if (vpcs && vpcs.length > 0) {
				debug('findVpc(%s): scanning %d vpcs', name, vpcs.length)
				let tagFinder = tag => tag.Key === 'Name' && tag.Value === name
				let vpcFinder = vpc => vpc.Tags.find(tagFinder)
				return callback(null, vpcs.find(vpcFinder))
			}

			debug('findVpc(%s): missing or no results', name)
			callback()
		})
	}

	function findSubnets(vpcId, callback) {
		debug('findSubnets(%s)', vpcId)

		let params = { Filters: [{ Name: 'vpc-id', Values: [vpcId] }] }

		ec2.describeSubnets(params, (err, result) => {
			if (err) return callback(err)

			let subnets = result.Subnets

			if (subnets && subnets.length > 0) {
				return callback(null, subnets)
			}

			debug('findSubnets(%s): missing or no results', vpcId)
			return callback(null, [])
		})
	}

	function checkInstanceReady(id, callback) {
		let params = {
			InstanceIds: [id]
		}

		ec2.describeInstanceStatus(params, callback)
	}
}

function createTagSpecifications(tags) {
	let result = []
	let tagNames = Object.keys(tags)
	if (tagNames.length === 0) {
		return result
	}

	let mapper = tagName => { return { Key: tagName, Value: tags[tagName] } }

	for (let rt of resourceType) {
		result.push({
			ResourceType: rt,
			Tags: tagNames.map(mapper)
		})
	}

	return result
}

function random(start, end) {
	let range = end - start
	return Math.floor((Math.random() * range) + start)
}

/**
 *	pick the default subnet, otherwise pick a random subnet
 *
 */
function pickSubnet(subnets) {
	debug('pickSubnet()')
	let filter = subnet => subnet.State === 'available'
	let availableSubnets = subnets.filter(filter)
	if (availableSubnets.length === 0) {
		debug('pickSubnet(): no available subnets in vpc')
		return
	}

	let finder = subnet => subnet.DefaultForAz

	let defaultSubnet = availableSubnets.find(finder)

	if (defaultSubnet) {
		debug('pickSubnet(): found default subnet "%s"', defaultSubnet.SubnetId)
		return defaultSubnet
	}

	let randomSubnet = availableSubnets[random(0, availableSubnets.length)]
	debug('pickSubnet(): picking random subnet "%s"', randomSubnet.SubnetId)
	return randomSubnet
}