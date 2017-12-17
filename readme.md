# @kessler/ec2-util

**a bunch of ec2 related utilities**

[![npm status](http://img.shields.io/npm/v/@kessler/ec2-util.svg?style=flat-square)](https://www.npmjs.org/package/@kessler/ec2-util) 

## example

`npm i @kessler/ec2-util`

```js
const ec2Util = require('@kessler/ec2-util')

ec2Utils.findInstancesByTags({ Name: 'test-worker' }, console.log)
ec2Utils.launchInstance({ vpcName: 'main', imageId, tags: { Name: 'test-worker' } }, console.log)
ec2Utils.findVpc('main', (err, vpc) => {
  ec2Utils.findSubnets(vpc.VpcId, console.log)
})
```

## license

[MIT](http://opensource.org/licenses/MIT) © Yaniv Kessler
