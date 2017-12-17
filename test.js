// env AWS_PROFILE=[profile] AWS_REGION=us-east-1 DEBUG=kessler:\* node test.js

// this is not really a test, just a runner

const aws = require('aws-sdk')
const ec2Utils = require('./index')(new aws.EC2())

const imageId = '[ami-id]'

//ec2Utils.findInstancesByTags({ Name: 'test-worker' }, console.log)
ec2Utils.launchInstance({ vpcName: 'main', imageId, tags: { Name: 'test-worker' } }, console.log)

// ec2Utils.findVpc('main', (err, vpc) => {
// 	ec2Utils.findSubnets(vpc.VpcId, console.log)
// })