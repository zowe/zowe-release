/*
 * This program and the accompanying materials are made available under the terms of the
 * Eclipse Public License v2.0 which accompanies this distribution, and is available at
 * https://www.eclipse.org/legal/epl-v20.html
 *
 * SPDX-License-Identifier: EPL-2.0
 *
 * Copyright IBM Corporation 2022
 */

const core = require('@actions/core')
const { github, utils } = require('zowe-common')
const fs = require('fs')
const Debug = require('debug')
const debug = Debug('zowe-release:validate')

// Defaults
const projectRootPath = process.env.GITHUB_WORKSPACE

// Gets inputs
var buildName = core.getInput('build-name')
var buildNum = core.getInput('build-num')
var releaseVersion = core.getInput('release-version')

//mandatory check
utils.mandatoryInputCheck(buildName, 'build-name')
utils.mandatoryInputCheck(buildNum, 'build-num')
utils.mandatoryInputCheck(releaseVersion, 'release-version')

console.log(`Checking if ${releaseVersion} is a valid semantic version ...`)
// validate release version scheme
// thanks semver/semver, this regular expression comes from
// https://github.com/semver/semver/issues/232#issuecomment-405596809
// in javascript regex \d means [0-9]; in bash you should do [0-9]
if (releaseVersion.match(/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/)) {
    logValidate('YES')
} else {
    throw new Error(`${releaseVersion} is not a valid semantic version.`)
}

if (releaseVersion.match(/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/)) {
    core.exportVariable('IS_FORMAL_RELEASE', 'true')
    console.log(`>>>> Version ${releaseVersion} is considered as a FORMAL RELEASE.`)
}
else {
    console.log(`>>>> Version ${releaseVersion} is NOT considered as a FORMAL RELEASE.`)
}

// init - will automatic decide if picking up v1 or v2 release json file
var zoweReleaseJsonFile = process.env.ZOWE_RELEASE_JSON_PATTERN
if (releaseVersion.startsWith('1')) {
	zoweReleaseJsonFile = zoweReleaseJsonFile.replace(/@/g,'1')
} else if (releaseVersion.startsWith('2')) {
	zoweReleaseJsonFile = zoweReleaseJsonFile.replace(/@/g,'2')
}
var zoweReleaseJsonObject = JSON.parse(fs.readFileSync(projectRootPath + '/' + zoweReleaseJsonFile))

// this is the target Artifactory path will be released to
var releaseFilesPattern = `${zoweReleaseJsonObject['zowe']['to']}/org/zowe/${releaseVersion}/*`

// check artifactory release pattern
console.log(`Checking if ${releaseVersion} already exists in Artifactory ...`)
var searchResult = searchArtifact(releaseFilesPattern)
if (!searchResult || searchResult == null || searchResult == '') {
	logValidate(`>>[validate 1/13]>> Target artifactory folder ${releaseFilesPattern} doesn\'t exist.`)
} else {
	throw new Error(`Zowe version ${releaseVersion} already exists (${releaseFilesPattern})`)
}

// check if tag already exists
if (github.tagExistsRemote(`v${releaseVersion}`)) {
	throw new Error(`Repository tag v${releaseVersion} already exists.`)
} else {
	logValidate(`>>[validate 2/13]>> Repository tag v${releaseVersion} doesn't exist.`)
}

// start to build up a new json derived from the zowe release json file
var releaseArtifacts = {}
releaseArtifacts['zowe'] = {}
releaseArtifacts['zowe']['buildName'] = buildName
releaseArtifacts['zowe']['buildNumber'] = buildNum

// get zowe build source artifact
var zowePax = searchArtifact(
	`${zoweReleaseJsonObject['zowe']['from']}/${zoweReleaseJsonObject['zowe']['sourcePath']}/${zoweReleaseJsonObject['zowe']['sourceFiles']['zowe-*.pax']}`,
	buildName,
	buildNum
)
if (zowePax['path']) {
	releaseArtifacts['zowe']['source'] = zowePax
	releaseArtifacts['zowe']['target'] = zoweReleaseJsonObject['zowe']['sourceFiles']['zowe-*.pax'].replace(/\*/g,releaseVersion)
} 
else {
	throw new Error(`no zowe pax found in the build`)
}
logValidate(`>>[validate 3/13]>> Found Zowe build ${releaseArtifacts['zowe']['source']['path']}.`)

// try to get Zowe build commit hash
if (releaseArtifacts['zowe']['source']['props']['vcs.revision'][0] != '' ) {
	releaseArtifacts['zowe']['revision'] = releaseArtifacts['zowe']['source']['props']['vcs.revision'][0]
}
else {
	throw new Error(`Zowe release artifact vcs revision is null`)
}
if (!releaseArtifacts['zowe']['revision'].match(/^[0-9a-fA-F]{40}$/)) { // if it's a valid SHA-1 commit hash
	throw new Error(`Cannot extract git revision from build \"${releaseArtifacts['zowe']['buildName']}/${releaseArtifacts['zowe']['buildNumber']}\"`)
}
logValidate(`>>[validate 4/13]>> Build ${releaseArtifacts['zowe']['buildName']}/${releaseArtifacts['zowe']['buildNumber']} commit hash is ${releaseArtifacts['zowe']['revision']}.`)

// get SMP/e build
try {
	var smpeZipSource = searchArtifact(
		`${zoweReleaseJsonObject['zowe']['from']}/${zoweReleaseJsonObject['zowe']['sourcePath']}/${zoweReleaseJsonObject['zowe']['sourceFiles']['zowe-smpe-*.zip']}`,
		buildName,
		buildNum
	)
	if (smpeZipSource['path']) {
		releaseArtifacts['smpe-zip'] = {}
		releaseArtifacts['smpe-zip']['source'] = smpeZipSource
		releaseArtifacts['smpe-zip']['target'] = zoweReleaseJsonObject['zowe']['sourceFiles']['zowe-smpe-*.zip'].replace(/\*/g,releaseVersion)
		logValidate(`>>[validate 5/13]>> Found SMP/e build ${smpeZipSource['path']}.`)
	}
	try {
		var smpePromoteTar = searchArtifact(
			`${zoweReleaseJsonObject['zowe']['from']}/${zoweReleaseJsonObject['zowe']['sourcePath']}/${zoweReleaseJsonObject['zowe']['sourceFiles']['smpe-promote-*.tar']}`,
			buildName,
			buildNum
		)
		logValidate(`>>[validate 6/13]>> Found SMP/e promote tar ${smpePromoteTar['path']}.`)
		core.exportVariable('SMPE_PTF_PROMOTE_TAR_PATH', smpePromoteTar['path'])
  	} catch (e2) {
		throw new Error(`no SMP/e promote tar found in the build`)
	}
} catch (e1) {
	throw new Error(`>>> no SMP/e zip found in the build`)
}

// get Docker images - amd64
try {
	var dockerImageAmd64 = searchArtifact(
		`${zoweReleaseJsonObject['zowe']['from']}/${zoweReleaseJsonObject['zowe']['sourcePath']}/${zoweReleaseJsonObject['zowe']['sourceFiles']['server-bundle.amd64-*.tar']}`,
		buildName,
		buildNum
	)
	if (dockerImageAmd64['path']) {
		releaseArtifacts['docker-amd64'] = {}
		releaseArtifacts['docker-amd64']['source'] = dockerImageAmd64
		releaseArtifacts['docker-amd64']['target'] = zoweReleaseJsonObject['zowe']['sourceFiles']['server-bundle.amd64-*.tar'].replace(/\*/g,releaseVersion)
		logValidate(`>>[validate 7/13]>> Found Docker image amd64 version ${dockerImageAmd64['path']}.`)
	}
} catch (e1) {
	throw new Error(`>>> no Docker image amd64 version found in the build.`)
}

// get Docker images with sources - amd64
try {
	var dockerImageSourcesAmd64 = searchArtifact(
		`${zoweReleaseJsonObject['zowe']['from']}/${zoweReleaseJsonObject['zowe']['sourcePath']}/${zoweReleaseJsonObject['zowe']['sourceFiles']['server-bundle.sources.amd64-*.tar']}`,
		buildName,
		buildNum
	)
	if (dockerImageSourcesAmd64['path']) {
		releaseArtifacts['docker-amd64-sources'] = {}
		releaseArtifacts['docker-amd64-sources']['source'] = dockerImageSourcesAmd64
		releaseArtifacts['docker-amd64-sources']['target'] = zoweReleaseJsonObject['zowe']['sourceFiles']['server-bundle.sources.amd64-*.tar'].replace(/\*/g,releaseVersion)
		logValidate(`>>[validate 8/13]>> Found Docker image amd64 sources version ${dockerImageSourcesAmd64['path']}.`)
	}
} catch (e1) {
	throw new Error(`>>> no Docker image amd64 sources version found in the build.`)
}

// get Docker images - s390x
try {
	var dockerImageS390x = searchArtifact(
		`${zoweReleaseJsonObject['zowe']['from']}/${zoweReleaseJsonObject['zowe']['sourcePath']}/${zoweReleaseJsonObject['zowe']['sourceFiles']['server-bundle.s390x-*.tar']}`,
		buildName,
		buildNum
	)
	if (dockerImageS390x['path']) {
		releaseArtifacts['docker-s390x'] = {}
		releaseArtifacts['docker-s390x']['source'] = dockerImageS390x
		releaseArtifacts['docker-s390x']['target'] = zoweReleaseJsonObject['zowe']['sourceFiles']['server-bundle.s390x-*.tar'].replace(/\*/g,releaseVersion)
		logValidate(`>>[validate 9/13]>> Found Docker image s390x version ${dockerImageS390x['path']}.`)
	}
} catch (e1) {
	throw new Error(`>>> no Docker image s390x version found in the build.`)
}

// get Docker images with sources - s390x
try {
	var dockerImageSourcesS390x = searchArtifact(
		`${zoweReleaseJsonObject['zowe']['from']}/${zoweReleaseJsonObject['zowe']['sourcePath']}/${zoweReleaseJsonObject['zowe']['sourceFiles']['server-bundle.sources.s390x-*.tar']}`,
		buildName,
		buildNum
	)
	if (dockerImageSourcesS390x['path']) {
		releaseArtifacts['docker-s390x-sources'] = {}
		releaseArtifacts['docker-s390x-sources']['source'] = dockerImageSourcesS390x
		releaseArtifacts['docker-s390x-sources']['target'] = zoweReleaseJsonObject['zowe']['sourceFiles']['server-bundle.sources.s390x-*.tar'].replace(/\*/g,releaseVersion)
		logValidate(`>>[validate 10/13]>> Found Docker image s390x sources version ${dockerImageSourcesS390x['path']}.`)
	}
} catch (e1) {
	throw new Error(`>>> no Docker image s390x sources version found in the build.`)
}

// get containerization
try {
	var containerization = searchArtifact(
		`${zoweReleaseJsonObject['zowe']['from']}/${zoweReleaseJsonObject['zowe']['sourcePath']}/${zoweReleaseJsonObject['zowe']['sourceFiles']['zowe-containerization-*.zip']}`,
		buildName,
		buildNum
	)
	if (containerization['path']) {
		releaseArtifacts['containerization'] = {}
		releaseArtifacts['containerization']['source'] = containerization
		releaseArtifacts['containerization']['target'] = zoweReleaseJsonObject['zowe']['sourceFiles']['zowe-containerization-*.zip'].replace(/\*/g,releaseVersion)
		logValidate(`>>[validate 11/13]>> Found containerization version ${containerization['path']}.`)
	}
} catch (e1) {
	throw new Error(`>>> no containerization version found in the build.`)
}

// get CLI CORE build source artifact
var cliPackages = searchArtifact(
	`${zoweReleaseJsonObject['zowe-cli']['from']}/${zoweReleaseJsonObject['zowe-cli']['sourcePath']}/*/${zoweReleaseJsonObject['zowe-cli']['sourceFiles']['zowe-cli-package-1*.zip']}`
)
if (cliPackages['path']) {
	releaseArtifacts['cli'] = {}
	releaseArtifacts['cli']['source'] = cliPackages
	releaseArtifacts['cli']['target'] = zoweReleaseJsonObject['zowe-cli']['sourceFiles']['zowe-cli-package-1*.zip'].replace(/\*/g,releaseVersion)
	logValidate(`>>[validate 12/13]>> Found Zowe CLI build ${releaseArtifacts['cli']['source']['path']}.`)
}

// get CLI PLUGINS builds source artifact
var cliPlugins = searchArtifact(
	`${zoweReleaseJsonObject['zowe-cli']['from']}/${zoweReleaseJsonObject['zowe-cli']['sourcePath']}/${zoweReleaseJsonObject['zowe-cli']['sourceFiles']['zowe-cli-plugins-1*.zip']}`
)
if (cliPlugins['path']) {
	releaseArtifacts['cli-plugins'] = {}
	releaseArtifacts['cli-plugins']['source'] = cliPlugins
	releaseArtifacts['cli-plugins']['target'] = zoweReleaseJsonObject['zowe-cli']['sourceFiles']['zowe-cli-plugins-1*.zip'].replace(/\*/g,releaseVersion)
	logValidate(`>>[validate 13/13]>> Found Zowe CLI Plugins ${releaseArtifacts['cli-plugins']['source']['path']}.`)
}

// write to file and print content
var promoteJsonFileNameFull = projectRootPath + '/tmp-release-artifacts.json'
core.setOutput('PROMOTE_JSON_FILE_NAME_FULL', promoteJsonFileNameFull)
fs.writeFileSync(promoteJsonFileNameFull, JSON.stringify(releaseArtifacts, null, 2))
console.log('####################################')
console.log('Printing tmp-release-artifacts.json')
console.log('####################################')
console.log(utils.sh(`cat ${projectRootPath}/tmp-release-artifacts.json`))

// This function will return a json object
// example:
// {
//     "path": "libs-snapshot-local/org/zowe/1.27.0-RC/zowe-1.27.0-rc-214-20220114164537.pax",
//     "type": "file",
//     "size": 409941504,
//     "created": "2022-01-14T16:45:56.528Z",
//     "modified": "2022-01-14T16:45:46.223Z",
//     "sha1": "e0de3a175aa45328fbe3bef115fb4c9686d790a0",
//     "md5": "cd01c8511b1d0b232007c42a580e4de1",
//     "props": {
//       "build.name": [
//         "zowe-install-packaging/rc"
//       ],
//       "build.number": [
//         "214"
//       ],
//       "build.timestamp": [
//         "1642177162837"
//       ],
//       "vcs.branch": [
//         "rc"
//       ],
//       "vcs.revision": [
//         "6411a292cb627d67c1386e6a07e9c22e64a4a20f"
//       ],
//       "vcs.url": [
//         "https://github.com/zowe/zowe-install-packaging.git"
//       ]
//     }
//   }
function searchArtifact(pattern, buildName, buildNum) {
	if ((buildName == '' && buildNum != '') || (buildName != '' && buildNum == '')) {
		throw new Error ('Function searchArtifact must have neither buildName or buildNum, or both')
	}
	var cmd = `jfrog rt search`
	if (buildName && buildNum) {
		cmd += ` --build="${buildName}/${buildNum}"`
	} 
	else {
		// if no buildNumber and buildNum, will search latest, ignoring those two inputs
		cmd += ` --sort-by=created --sort-order=desc --limit=1`
	}
	cmd += ` ${pattern} | jq -r '.[]'`
	debug(`searchArtifact full command: ${cmd}`)
	var out = utils.sh(cmd)
	if (!out || out == null || out == '') {
		return
	}
	else {
		return JSON.parse(out)
	}
}

function logValidate(msg) {
	console.log('\x1b[32m%s\x1b[0m', msg)
}