/* Javascript for H5PPlayerXBlock. */
function H5PPlayerXBlock(runtime, element, args) {
  // Initialize queue if not exists
  if (!window.H5PBlocksQueue) {
    window.H5PBlocksQueue = [];
    window.H5PBlocksQueueProcessing = false;
  }
  
  window.H5PBlocksQueue.push({runtime, element, args});
  
  if (!window.H5PBlocksQueueProcessing) {
    processNextBlock();
  }
  
  // Process blocks one at a time
  async function processNextBlock() {
    window.H5PBlocksQueueProcessing = true;
    
    if (window.H5PBlocksQueue.length > 0) {
      const blockData = window.H5PBlocksQueue.shift();
      await initH5PBlock(blockData.runtime, blockData.element, blockData.args);
      processNextBlock();
    } else {
      window.H5PBlocksQueueProcessing = false;
    }
  }
  
  async function initH5PBlock(runtime, element, args) {
    if (typeof require === "function") {
      // Point RequireJS at the bundled player. RequireJS adds ".js" itself.
      require.config({
        paths: { h5p: args.mainJsPath.replace(/\.js$/, "") },
      });
      return new Promise((resolve) => {
        require(["h5p"], function (H5PStandalone) {
          initWithH5P(H5PStandalone, "cms", runtime, element, args)
            .then(resolve);
        });
      });
    } else {
      await loadJS(args.mainJsPath);
      return initWithH5P(window.H5PStandalone, "lms", runtime, element, args);
    }
  }
  
  async function initWithH5P(H5PStandalone, service, runtime, element, args) {
    const contentUserDataUrl = runtime.handlerUrl(
      element,
      "user_interaction_data"
    );
    const contentxResultSaveUrl = runtime.handlerUrl(element, "result_handler");

    const h5pel = document.getElementById("h5p-" + args.player_id);
    if (h5pel && $(h5pel).children(".h5p-iframe-wrapper").length == 0) {
      const userObj = { name: args.user_full_name, mail: args.user_email };
      const options = {
        h5pJsonPath: args.h5pJsonPath,
        frameJs: args.frameJsPath,
        frameCss: args.frameCssPath,
        frame: args.frame,
        copyright: args.copyright,
        icon: args.icon,
        fullScreen: args.fullScreen,
        user: userObj,
        saveFreq: args.saveFreq,
        customJs: args.customJsPath,
        contentUserData: [
          {
            state: args.userData,
          },
        ],
        ajax: {
          contentUserDataUrl: contentUserDataUrl,
        },
      };

      try {
        await createH5PPlayer(H5PStandalone, h5pel, options);
        $(h5pel).siblings(".spinner-container").find(".spinner-border").hide();
        $(h5pel).show();

        if (args.mark_completion_on_open === true) {
          $.ajax({
            type: "POST",
            url: contentxResultSaveUrl,
            data: JSON.stringify({
              verb: {
                id: "http://adlnet.gov/expapi/verbs/experienced",
                display: { "en-US": "experienced" },
              },
              result: {
                completion: true,
                score: null,
              },
            }),
          });
        }

        H5P.externalDispatcher.on("xAPI", (event) => {
          let hasStatement = event && event.data && event.data.statement;
          if (!hasStatement) {
            return;
          }

          let statement = event.data.statement;
          let validVerb =
            statement.verb &&
            statement.verb.display &&
            statement.verb.display["en-US"];
          if (!validVerb) {
            return;
          }

          let isCompleted =
            statement.verb.display["en-US"] === "answered" ||
            statement.verb.display["en-US"] === "completed" ||
            statement.verb.display["en-US"] === "consumed";
          let isChild =
            statement.context &&
            statement.context.contextActivities &&
            statement.context.contextActivities.parent &&
            statement.context.contextActivities.parent[0] &&
            statement.context.contextActivities.parent[0].id;

          // Store only completed root events.
          if (isCompleted && !isChild) {
            $.ajax({
              type: "POST",
              url: contentxResultSaveUrl,
              data: JSON.stringify(event.data.statement),
            })
            .done(function () {
                  // handle fine request  here
            })
            .fail(function () {
              // handle fails request here
            });
          }
        });

        return Promise.resolve("Result successfully");
      } catch (error) {
        return Promise.reject(error.message);
      }
    }
  }
}

// Studio loads RequireJS globally, so the UMD header of h5p-standalone's
// frame.bundle.js registers a module instead of starting the H5P core.
// While the player loads, run scripts it added (marked with data-h5p)
// directly and pass every other define() call to RequireJS unchanged.
async function createH5PPlayer(H5PStandalone, el, options) {
  const requireDefine = window.define;
  const hasGlobalRequireJS = Boolean(requireDefine && requireDefine.amd);
  if (hasGlobalRequireJS) {
    window.define = function (...defineArgs) {
      const script = document.currentScript;
      if (script && script.dataset.h5p) {
        return defineArgs[defineArgs.length - 1]();
      }
      return requireDefine.apply(this, defineArgs);
    };
    window.define.amd = requireDefine.amd;
  }
  try {
    return await new H5PStandalone.H5P(el, options);
  } finally {
    if (hasGlobalRequireJS) {
      window.define = requireDefine;
    }
  }
}

function loadJS(src) {
  return new Promise((resolve) => {
    if (window.H5PStandalone) {
      resolve();
    } else {
      // Load the bundled H5PStandalone dynamically using $.getScript
      $.getScript(src)
        .done(function () {
          window.H5PStandalone = H5PStandalone;
          resolve();
        })
        .fail(function () {
          console.error("Error loading H5PStandalone.");
        });
    }
  });
}
