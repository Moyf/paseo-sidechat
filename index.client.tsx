import type { PluginClientContext } from "@getpaseo/plugin/client";
import { registerUi } from "./client/ui-registration";

export default function contribute(client: PluginClientContext) {
  return registerUi(client);
}
