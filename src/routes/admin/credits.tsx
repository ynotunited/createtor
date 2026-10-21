import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Coins } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { toUserMessage } from "@/lib/errors";

import { PageHeader } from "@/components/dashboard/PageHeader";
import { Badge } from "@/components/ui/badge";
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
import { Skeleton } from "@/components/ui/skeleton";
import { adminGrantCredits, listCreditTransactions, listWorkspaces } from "@/lib/admin.functions";

export const Route = createFileRoute("/admin/credits")({
  component: AdminCredits,
});

function AdminCredits() {
  const [workspaceId, setWorkspaceId] = useState("");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const queryClient = useQueryClient();

  const workspaces = useQuery({
    queryKey: ["admin-workspaces", "credit-picker"],
    queryFn: () => listWorkspaces({ data: { limit: 200 } }),
  });

  const transactions = useQuery({
    queryKey: ["admin-credits", workspaceId || "all"],
    queryFn: () =>
      listCreditTransactions({ data: { workspaceId: workspaceId || undefined, limit: 50 } }),
  });

  const grant = useMutation({
    mutationFn: () =>
      adminGrantCredits({
        data: { workspaceId, amount: Number(amount), reason: reason || "Manual admin adjustment" },
      }),
    onSuccess: (res) => {
      toast.success(`Balance updated to ${res.balance.toLocaleString()}`);
      setAmount("");
      setReason("");
      queryClient.invalidateQueries({ queryKey: ["admin-credits"] });
      queryClient.invalidateQueries({ queryKey: ["admin-workspaces"] });
      queryClient.invalidateQueries({ queryKey: ["admin-overview"] });
    },
    onError: (error) => toast.error(toUserMessage(error, "Grant failed")),
  });

  const valid = workspaceId && Number.isFinite(Number(amount)) && Number(amount) !== 0;

  return (
    <>
      <PageHeader
        title="Credits"
        description="Grant or adjust generation credits for any workspace."
      />

      <Card className="glass-panel max-w-2xl">
        <CardHeader>
          <CardTitle className="text-lg">Manual adjustment</CardTitle>
          <CardDescription>
            Positive amounts grant credits; negative amounts deduct them.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label>Workspace</Label>
            <Select value={workspaceId} onValueChange={setWorkspaceId}>
              <SelectTrigger>
                <SelectValue placeholder="Select a workspace" />
              </SelectTrigger>
              <SelectContent>
                {workspaces.data?.map((ws) => (
                  <SelectItem key={ws.id} value={ws.id}>
                    {ws.name} · {ws.balance.toLocaleString()} credits
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="amount">Amount</Label>
              <Input
                id="amount"
                type="number"
                placeholder="e.g. 500 or -500"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="reason">Reason</Label>
              <Input
                id="reason"
                placeholder="Support goodwill"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </div>
          </div>
          <Button disabled={!valid || grant.isPending} onClick={() => grant.mutate()}>
            <Coins className="mr-2 size-4" />
            Apply adjustment
          </Button>
        </CardContent>
      </Card>

      <div className="space-y-3">
        <h2 className="font-display text-lg font-semibold">Recent transactions</h2>
        <Card className="glass-panel">
          <CardContent className="p-0">
            {transactions.isLoading ? (
              <div className="space-y-3 p-5">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : transactions.data?.length === 0 ? (
              <p className="p-5 text-sm text-muted-foreground">No transactions recorded.</p>
            ) : (
              <ul className="divide-y divide-border">
                {transactions.data?.map((tx) => (
                  <li key={tx.id} className="flex items-center justify-between gap-3 px-5 py-3">
                    <div>
                      <p className="text-sm font-medium">{tx.reason || tx.kind}</p>
                      <p className="text-xs text-muted-foreground">{tx.kind}</p>
                    </div>
                    <div className="text-right">
                      <Badge variant={tx.amount >= 0 ? "secondary" : "destructive"}>
                        {tx.amount >= 0 ? "+" : ""}
                        {tx.amount.toLocaleString()}
                      </Badge>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {new Date(tx.created_at).toLocaleString()}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
