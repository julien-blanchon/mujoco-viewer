<script lang="ts">
  import { ViewerApp } from "@mujoco-viewer/viewer-ui";
  import { createVSCodeAdapter } from "./vscodeAdapter.svelte";

  const adapter = createVSCodeAdapter();
</script>

<ViewerApp {adapter} />
