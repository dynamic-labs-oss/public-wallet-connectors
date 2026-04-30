import yargs from "yargs";
import * as core from '@actions/core';
import { hideBin } from "yargs/helpers";
import { getOctokit } from "@actions/github";
import { detectTag } from "../lib/detectTag.js";
import { releaseChangelog } from "nx/release/index.js";
import { NxReleaseChangelogResult } from "nx/src/command-line/release/changelog.js";

const { GITHUB_WORKSPACE } = process.env

/**
 * HACK:
 *
 * Because of this function in NX https://github.com/nrwl/nx/blob/7232b392ba26ff74130170a5bec229d9ccef7005/packages/nx/src/plugins/js/utils/register.ts#L12-L47
 * The _ variable is set to 'tsx-spoof' if the file ends with tsx
 * This is to allow natural behavior when nx tries to generate the project graph and tries to `require('a.ts.file.ts)`
 */
process.env._ = process.env._?.endsWith('tsx') ? 'tsx-spoof' : process.env._


const createRelease = async (
  target_commitish: string,
  changlog: NxReleaseChangelogResult['workspaceChangelog'],
  isLatest = false,
  dryRun = true
) => {
  core.startGroup('Create Release');

  if (!process.env.GITHUB_TOKEN?.length) {
    throw new Error('GITHUB_TOKEN is required to create a release');
  }

  const oktokit = getOctokit(process.env.GITHUB_TOKEN);
  const gitTag = changlog?.releaseVersion.gitTag;
  const changelogBody = changlog?.contents;
  const isPrerelease = changlog?.releaseVersion.isPrerelease;

  if (!gitTag) {
    throw new Error('gitTag is required to create a release');
  }

  if (!target_commitish) {
    throw new Error('target_commitish is required to create a release');
  }

  core.info(`Creating release for tag: ${gitTag}`);
  core.info(`Target commitish: ${target_commitish}`);
  core.info(`Is latest: ${isLatest}`);
  core.info(`Is prerelease: ${isPrerelease}`);

  if (!dryRun) {
    const [owner, repo] = process.env.GITHUB_REPOSITORY.split('/');
    await oktokit.rest.repos.createRelease({
      owner,
      repo,
      tag_name: gitTag,
      target_commitish,
      name: gitTag,
      prerelease: isPrerelease,
      body: changelogBody,
      make_latest: isLatest ? 'true' : 'false',
    })
  }

  core.endGroup();
};

const publishPackages = async () => {

  if (process.env.GITHUB_ACTION) {
    core.info(`Changing directory to ${GITHUB_WORKSPACE}`);
    process.chdir(GITHUB_WORKSPACE);
  }

  const options = await yargs(hideBin(process.argv))
    .version(false) // don't use the default meaning of version in yargs
    .option('dryRun', {
      alias: 'd',
      description:
        'Whether or not to perform a dry-run of the release process, defaults to true',
      type: 'boolean',
      default: true,
    })
    .option('verbose', {
      description:
        'Whether or not to enable verbose logging, defaults to false',
      type: 'boolean',
      default: false,
    })
    .options('fromSha', {
      description: 'The commit sha to start from',
      type: 'string',
      required: true,
    })
    .options('toSha', {
      description: 'The commit sha to end at',
      type: 'string',
      required: true,
    })
    .options('workspaceVersion', {
      description: 'The version to release',
      type: 'string',
      required: true,
    })
    .options('createRelease', {
      description: 'Whether or not to create a release on GitHub',
      type: 'boolean',
      default: false,
    })
    .parseAsync();

  const fromSha = options.fromSha;
  const toSha = options.toSha;
  const workspaceVersion = options.workspaceVersion;

  // Updates the changelog according to conventional commits
  core.info(`Calling changelog with: ${JSON.stringify({
    version: workspaceVersion,
    to: toSha,
    from: fromSha,
    dryRun: options.dryRun,
    gitCommit: false,
    gitTag: false,
    stageChanges: false,
    createRelease: false,
    verbose: options.verbose,
  }, null, 2)}`)
  const { workspaceChangelog } = await releaseChangelog({
    version: workspaceVersion,
    to: toSha,
    from: fromSha,
    dryRun: options.dryRun,
    gitCommit: false,
    gitTag: false,
    stageChanges: false,
    createRelease: false,
    verbose: options.verbose,
  });

  // Detect tag to use for publishing
  // Using @dynamic-labs-connectors/safe-evm as the canonical package for latest-version comparison
  const distTag = await detectTag('@dynamic-labs-connectors/safe-evm', workspaceVersion);

  if (options.createRelease) {
    if (!workspaceChangelog) {
      throw new Error('Missing changelog');
    }
    await createRelease(toSha, workspaceChangelog, distTag === 'latest', options.dryRun);
  }

  // Expose distTag to the next workflow step, which runs `npm publish` directly
  // so that OIDC trusted publishing engages (pnpm publish via nx does not reliably
  // perform the OIDC exchange against registry.npmjs.org).
  core.setOutput('distTag', distTag);
  core.info(`Detected distTag: ${distTag} (version: ${workspaceVersion})`);
};

publishPackages().catch((err) => {
  core.setFailed(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
