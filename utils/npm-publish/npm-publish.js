"use strict";

const fs = require("fs-extra");
const log = require("libnpm/log");
const publish = require("libnpm/publish");
const readJSON = require("libnpm/read-json");
const figgyPudding = require("figgy-pudding");
const runLifecycle = require("@lerna/run-lifecycle");

module.exports = npmPublish;

const PublishConfig = figgyPudding(
  {
    "dry-run": { default: false },
    dryRun: "dry-run",
    log: { default: log },
    "project-scope": {},
    projectScope: "project-scope",
    tag: { default: "latest" },
  },
  {
    other() {
      // open it up for the sake of tests
      return true;
    },
  }
);

function npmPublish(pkg, tarFilePath, _opts) {
  const opts = PublishConfig(_opts, {
    projectScope: pkg.name,
  });

  opts.log.verbose("publish", pkg.name);

  let chain = Promise.resolve();

  if (!opts.dryRun) {
    chain = chain.then(() => Promise.all([fs.readFile(tarFilePath), readJSON(pkg.manifestLocation)]));
    chain = chain.then(([tarData, manifest]) => {
      // non-default tag needs to override publishConfig.tag,
      // which is merged over opts.tag in libnpm/publish
      if (
        opts.tag !== "latest" &&
        manifest.publishConfig &&
        manifest.publishConfig.tag &&
        manifest.publishConfig.tag !== opts.tag
      ) {
        // eslint-disable-next-line no-param-reassign
        manifest.publishConfig.tag = opts.tag;
      }

      return publish(manifest, tarData, opts).catch(err => {
        opts.log.silly("", err);
        opts.log.error(err.code, (err.body && err.body.error) || err.message);

        // avoid dumping logs, this isn't a lerna problem
        err.name = "ValidationError";

        // ensure process exits non-zero
        process.exitCode = "errno" in err ? err.errno : 1;

        // re-throw to break chain upstream
        throw err;
      });
    });
  }

  chain = chain.then(() => runLifecycle(pkg, "publish", opts));
  chain = chain.then(() => runLifecycle(pkg, "postpublish", opts));

  return chain;
}
