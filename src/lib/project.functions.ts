import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  assertProjectInWorkspace,
  assertRowInWorkspace,
  assertScenesAccessible,
} from "@/lib/ownership";

const SceneDraft = z.object({
  sceneNumber: z.number().int().min(1),
  narration: z.string().max(4000).default(""),
  visualDescription: z.string().max(4000).default(""),
  imagePrompt: z.string().max(4000).default(""),
  videoPrompt: z.string().max(4000).default(""),
  cameraMovement: z.string().max(400).default(""),
  emotion: z.string().max(200).default(""),
  environment: z.string().max(400).default(""),
  lighting: z.string().max(400).default(""),
  durationSeconds: z.number().min(1).max(120).default(5),
  transition: z.string().max(200).default(""),
});

export type SceneDraft = z.infer<typeof SceneDraft>;

const SaveStoryboardInput = z.object({
  workspaceId: z.string().uuid(),
  projectId: z.string().uuid().nullable().optional(),
  title: z.string().min(1).max(200),
  visualStyle: z.string().max(80),
  aspectRatio: z.enum(["16:9", "9:16", "1:1"]).default("16:9"),
  durationSeconds: z.number().int().min(1).max(3600).nullable().optional(),
  characterId: z.string().uuid().nullable().optional(),
  scriptId: z.string().uuid().nullable().optional(),
  scenes: z.array(SceneDraft).min(1).max(120),
});

/**
 * Persists a generated storyboard as a project + its scenes. Passing an
 * existing projectId replaces that project's scenes (used for regeneration),
 * so a paid storyboard is never lost when the user leaves the page.
 */
export const saveStoryboard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => SaveStoryboardInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;

    // Referenced rows must belong to the same workspace, otherwise a crafted id
    // could link this project to another tenant's character/script.
    if (data.characterId) {
      await assertRowInWorkspace(
        supabase,
        "characters",
        data.characterId,
        data.workspaceId,
        "Character",
      );
    }
    if (data.scriptId) {
      await assertRowInWorkspace(supabase, "scripts", data.scriptId, data.workspaceId, "Script");
    }

    let projectId = data.projectId ?? null;
    if (projectId) {
      // Never trust a client-supplied project id: confirm it belongs to the
      // workspace being written before replacing its scenes.
      await assertProjectInWorkspace(supabase, projectId, data.workspaceId);
      const { error } = await supabase
        .from("projects")
        .update({
          title: data.title,
          visual_style: data.visualStyle,
          aspect_ratio: data.aspectRatio,
          duration_seconds: data.durationSeconds ?? null,
          script_id: data.scriptId ?? null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", projectId)
        .eq("workspace_id", data.workspaceId);
      if (error) throw new Error(error.message);
      const { error: clearError } = await supabase
        .from("scenes")
        .delete()
        .eq("project_id", projectId)
        .eq("workspace_id", data.workspaceId);
      if (clearError) throw new Error(clearError.message);
    } else {
      const created = await supabase
        .from("projects")
        .insert({
          workspace_id: data.workspaceId,
          title: data.title,
          status: "draft",
          visual_style: data.visualStyle,
          aspect_ratio: data.aspectRatio,
          duration_seconds: data.durationSeconds ?? null,
          script_id: data.scriptId ?? null,
        })
        .select("id")
        .single();
      if (created.error) throw new Error(created.error.message);
      projectId = created.data.id;
    }

    const rows = data.scenes.map((s) => ({
      workspace_id: data.workspaceId,
      project_id: projectId!,
      scene_number: s.sceneNumber,
      narration: s.narration,
      visual_description: s.visualDescription,
      image_prompt: s.imagePrompt,
      video_prompt: s.videoPrompt,
      camera_movement: s.cameraMovement,
      character_id: data.characterId ?? null,
      emotion: s.emotion,
      environment: s.environment,
      lighting: s.lighting,
      duration_seconds: s.durationSeconds,
      transition: s.transition,
    }));
    const inserted = await supabase.from("scenes").insert(rows).select("id,scene_number");
    if (inserted.error) throw new Error(inserted.error.message);

    return { projectId: projectId!, sceneCount: inserted.data?.length ?? 0 };
  });

const UpdateSceneInput = z.object({
  sceneId: z.string().uuid(),
  narration: z.string().max(4000).optional(),
  visualDescription: z.string().max(4000).optional(),
  imagePrompt: z.string().max(4000).optional(),
  videoPrompt: z.string().max(4000).optional(),
  cameraMovement: z.string().max(400).optional(),
  emotion: z.string().max(200).optional(),
  environment: z.string().max(400).optional(),
  lighting: z.string().max(400).optional(),
  durationSeconds: z.number().min(1).max(120).optional(),
  transition: z.string().max(200).optional(),
});

export const updateScene = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => UpdateSceneInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { sceneId, ...rest } = data;
    const patch: Record<string, string | number> = {};
    const map: Record<string, string> = {
      narration: "narration",
      visualDescription: "visual_description",
      imagePrompt: "image_prompt",
      videoPrompt: "video_prompt",
      cameraMovement: "camera_movement",
      emotion: "emotion",
      environment: "environment",
      lighting: "lighting",
      durationSeconds: "duration_seconds",
      transition: "transition",
    };
    for (const [key, value] of Object.entries(rest)) {
      if (value !== undefined) patch[map[key]!] = value;
    }
    if (!Object.keys(patch).length) return { ok: true };
    await assertScenesAccessible(supabase, [sceneId]);
    const { error } = await supabase
      .from("scenes")
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("id", sceneId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteScene = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ sceneId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertScenesAccessible(context.supabase, [data.sceneId]);
    const { error } = await context.supabase.from("scenes").delete().eq("id", data.sceneId);
    if (error) throw new Error(error.message);
    const { auditEvent } = await import("@/lib/audit.server");
    await auditEvent({
      actorId: (context as unknown as { userId?: string }).userId ?? null,
      action: "scene.delete",
      entity: "scenes",
      entityId: data.sceneId,
    });
    return { ok: true };
  });

export const reorderScenes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z.object({ sceneIds: z.array(z.string().uuid()).min(1).max(150) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    await assertScenesAccessible(supabase, data.sceneIds);
    // One statement for the whole ordering instead of one UPDATE per scene.
    const { error } = await supabase.rpc("reorder_scenes", { _ids: data.sceneIds });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
