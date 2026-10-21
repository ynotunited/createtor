import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Trash2, UserPlus, Users } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { recordAudit } from "@/lib/audit.functions";

import { ConfirmButton } from "@/components/dashboard/ConfirmButton";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { ListSkeleton } from "@/components/dashboard/Skeletons";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useWorkspace } from "@/hooks/useWorkspace";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_dash/character-studio")({
  head: () => ({
    meta: [
      { title: "Character Studio — Createtor" },
      {
        name: "description",
        content:
          "Reusable channel characters with consistent appearance, clothing, personality and voice across videos.",
      },
      { property: "og:title", content: "Character Studio — Createtor" },
      { property: "og:description", content: "Reusable character profiles for recurring videos." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: CharacterStudio,
});

const EMPTY = {
  name: "",
  age: "",
  gender: "",
  appearance: "",
  hairstyle: "",
  clothing: "",
  personality: "",
  voice_id: "",
};

function CharacterStudio() {
  const { data: workspace } = useWorkspace();
  const queryClient = useQueryClient();
  const [form, setForm] = useState(EMPTY);

  const characters = useQuery({
    queryKey: ["characters", workspace?.id],
    enabled: Boolean(workspace?.id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("characters")
        .select("*")
        .eq("workspace_id", workspace!.id)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data;
    },
  });

  const voices = useQuery({
    queryKey: ["voices", workspace?.id],
    enabled: Boolean(workspace?.id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("voices")
        .select("id,name,language,accent")
        .eq("workspace_id", workspace!.id)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data;
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      const consistencyPrompt = [
        form.name,
        form.age && `${form.age} years old`,
        form.gender,
        form.appearance,
        form.hairstyle,
        form.clothing,
      ]
        .filter(Boolean)
        .join(", ");
      const { error } = await supabase.from("characters").insert({
        workspace_id: workspace!.id,
        ...form,
        voice_id: form.voice_id || null,
        consistency_prompt: consistencyPrompt,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Character saved");
      setForm(EMPTY);
      queryClient.invalidateQueries({ queryKey: ["characters", workspace?.id] });
    },
    onError: () => toast.error("Could not save the character."),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("characters")
        .delete()
        .eq("id", id)
        .eq("workspace_id", workspace!.id);
      if (error) throw error;
    },
    onSuccess: (_data, id) => {
      toast.success("Character deleted");
      if (workspace?.id) {
        recordAudit({
          data: {
            action: "character.delete",
            entity: "characters",
            entityId: id,
            workspaceId: workspace.id,
          },
        }).catch(() => undefined);
      }
      queryClient.invalidateQueries({ queryKey: ["characters", workspace?.id] });
    },
  });

  return (
    <>
      <PageHeader
        title="Character Studio"
        description="Character profiles are reused as a consistency prompt in every scene, so recurring people stay visually the same."
      />

      <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
        <Card className="glass-panel h-fit">
          <CardHeader>
            <CardTitle className="text-lg">New character</CardTitle>
            <CardDescription>
              Describe the character once. This description is reused as the consistency prompt in
              every scene, so recurring people stay visually the same.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {(
              [
                ["name", "Name"],
                ["age", "Age"],
                ["gender", "Gender"],
                ["hairstyle", "Hairstyle"],
                ["clothing", "Clothing"],
              ] as const
            ).map(([key, label]) => (
              <div key={key} className="space-y-2">
                <Label htmlFor={key}>{label}</Label>
                <Input
                  id={key}
                  value={form[key]}
                  onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                />
              </div>
            ))}
            <div className="space-y-2">
              <Label htmlFor="appearance">Appearance</Label>
              <Textarea
                id="appearance"
                rows={3}
                value={form.appearance}
                onChange={(e) => setForm({ ...form, appearance: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="personality">Personality</Label>
              <Textarea
                id="personality"
                rows={3}
                value={form.personality}
                onChange={(e) => setForm({ ...form, personality: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="voice_id">Voice</Label>
              <Select
                value={form.voice_id || "none"}
                onValueChange={(value) =>
                  setForm({ ...form, voice_id: value === "none" ? "" : value })
                }
              >
                <SelectTrigger id="voice_id">
                  <SelectValue placeholder="No voice linked" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No voice linked</SelectItem>
                  {voices.data?.map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      {v.name}
                      {v.language ? ` · ${v.language}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {voices.data?.length
                  ? "Links a saved Voice Studio profile to this character."
                  : "Create a profile in Voice Studio to link a voice here."}
              </p>
            </div>
            <Button
              className="w-full"
              onClick={() => save.mutate()}
              disabled={save.isPending || form.name.trim().length < 2}
            >
              <UserPlus className="mr-1.5 size-4" /> Save character
            </Button>
          </CardContent>
        </Card>

        <div className="grid gap-4 sm:grid-cols-2">
          {characters.isLoading ? (
            <ListSkeleton rows={3} className="sm:col-span-2" />
          ) : characters.data?.length ? (
            characters.data.map((c) => (
              <Card key={c.id} className="glass-panel">
                <CardHeader>
                  <CardTitle className="text-base">{c.name}</CardTitle>
                  <CardDescription>
                    {[c.age, c.gender].filter(Boolean).join(" · ") || "No demographics set"}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  {c.appearance && <p>{c.appearance}</p>}
                  {c.consistency_prompt && (
                    <p className="rounded-md bg-muted px-2.5 py-2 text-xs text-muted-foreground">
                      {c.consistency_prompt}
                    </p>
                  )}
                  {c.voice_id && (
                    <p className="text-xs text-muted-foreground">
                      Voice:{" "}
                      {voices.data?.find((v) => v.id === c.voice_id)?.name ?? "linked profile"}
                    </p>
                  )}
                  <ConfirmButton
                    title={`Delete ${c.name}?`}
                    description="This character will be removed permanently and can no longer be reused in storyboards."
                    onConfirm={() => remove.mutate(c.id)}
                    trigger={
                      <Button size="sm" variant="ghost" className="text-destructive">
                        <Trash2 className="mr-1.5 size-3.5" /> Delete
                      </Button>
                    }
                  />
                </CardContent>
              </Card>
            ))
          ) : (
            <EmptyState
              className="sm:col-span-2"
              icon={Users}
              title="No characters yet"
              description="Describe a character on the left and it becomes a reusable consistency prompt."
            />
          )}
        </div>
      </div>
    </>
  );
}
