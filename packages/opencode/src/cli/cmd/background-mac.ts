import { cmd } from "./cmd"
import { launchVMManager } from "../../computer/vm-manager"

export const BackgroundMacCommand = cmd({
  command: "background-mac",
  describe: "create, show or manage your isolated background Mac",
  builder: (yargs) => yargs.option("self-test", { type: "boolean", default: false, describe: "check the manager without starting or downloading macOS" }),
  handler: async (args) => { console.log(await launchVMManager(args.selfTest)) },
})
