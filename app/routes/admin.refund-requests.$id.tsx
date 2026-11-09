import { useEffect, useRef, type ReactNode, type RefObject } from "react";
import { data, isRouteErrorResponse, Link, useFetcher } from "react-router";
import { z } from "zod";
import { AlertTriangle } from "lucide-react";
import type { Route } from "./+types/admin.refund-requests.$id";
import { RefundRequestStatus } from "~/db/schema";
import {
  approveRefundRequest,
  declineRefundRequest,
  getRefundRequestDetail,
  requireSupportTeamMember,
} from "~/lib/refund-requests.server";
import { formatWatchTime, REFUND_WINDOW_DAYS } from "~/lib/refunds";
import { parseFormData, parseParams } from "~/lib/validation";
import { formatPrice } from "~/lib/utils";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader } from "~/components/ui/card";
import { Label } from "~/components/ui/label";
import { Textarea } from "~/components/ui/textarea";

const paramsSchema = z.object({
  id: z.coerce.number().int(),
});

const decisionSchema = z.discriminatedUnion("intent", [
  z.object({ intent: z.literal("approve") }),
  z.object({
    intent: z.literal("decline"),
    reasonForDecline: z
      .string()
      .trim()
      .min(1, "Write a Reason for Decline.")
      .max(1000, "Please keep the Reason for Decline under 1000 characters."),
  }),
]);

type DecisionResponse = {
  outcome?: string;
  errors?: Record<string, string>;
};

export function meta() {
  return [
    { title: "Refund Request — Cadence" },
    { name: "description", content: "Decide a Refund Request" },
  ];
}

export async function loader({ params, request }: Route.LoaderArgs) {
  await requireSupportTeamMember(request);
  const { id } = parseParams(params, paramsSchema);
  const refundRequest = getRefundRequestDetail(id);

  if (!refundRequest) {
    throw data("Refund Request not found.", { status: 404 });
  }

  return { refundRequest };
}

export async function action({ params, request }: Route.ActionArgs) {
  const supportTeamMember = await requireSupportTeamMember(request);
  const { id } = parseParams(params, paramsSchema);
  const parsed = parseFormData(await request.formData(), decisionSchema);

  if (!parsed.success) {
    return data({ errors: parsed.errors }, { status: 400 });
  }

  const { outcome } =
    parsed.data.intent === "approve"
      ? approveRefundRequest(id, supportTeamMember.id)
      : declineRefundRequest(
          id,
          supportTeamMember.id,
          parsed.data.reasonForDecline
        );

  if (outcome === "not-found") {
    throw data("Refund Request not found.", { status: 404 });
  }

  // Not an error status, so the page reloads and shows the decision that
  // actually stands.
  return { outcome };
}

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-sm">{children}</dd>
    </div>
  );
}

function ConfirmDialog({
  dialogRef,
  title,
  children,
}: {
  dialogRef: RefObject<HTMLDialogElement | null>;
  title: string;
  children: ReactNode;
}) {
  return (
    <dialog
      ref={dialogRef}
      className="m-auto w-full max-w-md rounded-lg border bg-background p-6 text-foreground backdrop:bg-black/50"
    >
      <h2 className="mb-2 text-lg font-semibold">{title}</h2>
      {children}
    </dialog>
  );
}

function refundDescription(
  amount: number,
  refundedSeats: number,
  totalSeats: number
) {
  return totalSeats > 0
    ? `${refundedSeats} of ${totalSeats} Seats, ${formatPrice(amount)}`
    : formatPrice(amount);
}

export default function AdminRefundRequest({
  loaderData,
}: Route.ComponentProps) {
  const { refundRequest } = loaderData;
  const fetcher = useFetcher<DecisionResponse>();
  const approveDialog = useRef<HTMLDialogElement>(null);
  const declineDialog = useRef<HTMLDialogElement>(null);
  const isSubmitting = fetcher.state !== "idle";
  const isOpen = refundRequest.status === RefundRequestStatus.Open;
  const { seats, refundIfApproved, progress } = refundRequest;

  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data?.outcome) {
      approveDialog.current?.close();
      declineDialog.current?.close();
    }
  }, [fetcher.state, fetcher.data]);

  const statusLabel = {
    [RefundRequestStatus.Open]: "Open Refund Request",
    [RefundRequestStatus.Approved]: "Approved Refund Request",
    [RefundRequestStatus.Declined]: "Declined Refund Request",
  }[refundRequest.status];

  return (
    <div className="mx-auto max-w-3xl p-6 lg:p-8">
      <nav className="mb-6 text-sm text-muted-foreground">
        <Link to="/admin/refund-requests" className="hover:text-foreground">
          Refund Requests
        </Link>
        <span className="mx-2">/</span>
        <span className="text-foreground">{refundRequest.learnerName}</span>
      </nav>

      <div className="mb-6">
        <h1 className="text-3xl font-bold">{statusLabel}</h1>
        <p className="mt-1 text-muted-foreground">
          {refundRequest.courseTitle}
        </p>
      </div>

      {fetcher.data?.outcome === "already-decided" && (
        <p
          role="alert"
          className="mb-6 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-200"
        >
          Another Support Team Member already decided this Refund Request. Their
          decision stands.
        </p>
      )}
      {fetcher.data?.outcome === "nothing-to-refund" && (
        <p
          role="alert"
          className="mb-6 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-200"
        >
          Every Seat has now been claimed, so there is nothing left to refund.
        </p>
      )}

      <Card className="mb-6">
        <CardContent className="pt-6">
          <dl className="grid gap-4 sm:grid-cols-2">
            <Detail label="Learner">
              {refundRequest.learnerName}
              <br />
              <span className="text-muted-foreground">
                {refundRequest.learnerEmail}
              </span>
            </Detail>
            <Detail label="Amount paid">
              {formatPrice(refundRequest.amountPaid)}
            </Detail>
            <Detail label="Purchased">
              {new Date(refundRequest.purchasedAt).toLocaleDateString()}
            </Detail>
            <Detail label="Raised">
              {new Date(refundRequest.requestedAt).toLocaleDateString()} (day{" "}
              {refundRequest.dayOfRefundWindow} of {REFUND_WINDOW_DAYS})
            </Detail>
            <Detail label="Watch time">
              {formatWatchTime(progress.watchTimeSeconds)}
            </Detail>
            <Detail label="Lessons completed">
              {progress.lessonsCompleted} of {progress.totalLessons}
            </Detail>
            {isOpen && (
              <Detail label="Refund if approved now">
                {refundDescription(
                  refundIfApproved.amount,
                  refundIfApproved.refundedSeats,
                  seats.total
                )}
              </Detail>
            )}
          </dl>
          <div className="mt-4">
            <p className="text-sm text-muted-foreground">
              The Learner&apos;s reason
            </p>
            <p className="mt-0.5 text-sm">{refundRequest.reason}</p>
          </div>
        </CardContent>
      </Card>

      {!isOpen && (
        <Card className="mb-6">
          <CardHeader>
            <h2 className="text-lg font-semibold">Decision</h2>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-4 sm:grid-cols-2">
              <Detail label="Decided by">
                {refundRequest.decidedByName ?? "Unknown"}
              </Detail>
              <Detail label="Decided on">
                {refundRequest.decidedAt
                  ? new Date(refundRequest.decidedAt).toLocaleDateString()
                  : "Unknown"}
              </Detail>
              {refundRequest.refund && (
                <Detail label="Pending Refund">
                  {refundDescription(
                    refundRequest.refund.amount,
                    refundRequest.refund.refundedSeats,
                    seats.total
                  )}
                </Detail>
              )}
              {refundRequest.reasonForDecline && (
                <Detail label="Reason for Decline">
                  {refundRequest.reasonForDecline}
                </Detail>
              )}
            </dl>
          </CardContent>
        </Card>
      )}

      <Card className="mb-6">
        <CardHeader>
          <h2 className="text-lg font-semibold">Earlier Refund Requests</h2>
        </CardHeader>
        <CardContent>
          {refundRequest.earlierRefundRequests.length === 0 ? (
            <p className="text-sm text-muted-foreground">None.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {refundRequest.earlierRefundRequests.map((earlier) => (
                <li key={earlier.id} className="flex justify-between gap-3">
                  <Link
                    to={`/admin/refund-requests/${earlier.id}`}
                    className="hover:underline"
                  >
                    {earlier.courseTitle} ·{" "}
                    {new Date(earlier.requestedAt).toLocaleDateString()}
                  </Link>
                  <span className="text-muted-foreground">
                    {earlier.status === RefundRequestStatus.Approved
                      ? "Approved"
                      : "Declined"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {isOpen && (
        <div>
          <div className="flex gap-3">
            <Button
              disabled={!refundRequest.canApprove}
              onClick={() => approveDialog.current?.showModal()}
            >
              Approve
            </Button>
            <Button
              variant="outline"
              onClick={() => declineDialog.current?.showModal()}
            >
              Decline
            </Button>
          </div>
          {!refundRequest.canApprove && (
            <p className="mt-2 text-sm text-muted-foreground">
              Every Seat has been claimed, so this Refund Request can only be
              declined.
            </p>
          )}

          <ConfirmDialog
            dialogRef={approveDialog}
            title="Approve this Refund Request?"
          >
            <p className="mb-4 text-sm text-muted-foreground">
              This creates a Pending Refund of{" "}
              {refundDescription(
                refundIfApproved.amount,
                refundIfApproved.refundedSeats,
                seats.total
              )}
              .{" "}
              {seats.total > 0
                ? "Unclaimed Seats stop working."
                : "The Learner loses access to the course."}{" "}
              This decision is final.
            </p>
            <fetcher.Form method="post" className="flex justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => approveDialog.current?.close()}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                name="intent"
                value="approve"
                disabled={isSubmitting}
              >
                Approve
              </Button>
            </fetcher.Form>
          </ConfirmDialog>

          <ConfirmDialog
            dialogRef={declineDialog}
            title="Decline this Refund Request?"
          >
            <p className="mb-4 text-sm text-muted-foreground">
              The Learner will be emailed your Reason for Decline. This decision
              is final, but they may raise a new Refund Request.
            </p>
            <fetcher.Form method="post" className="space-y-3">
              <input type="hidden" name="intent" value="decline" />
              <div>
                <Label htmlFor="reasonForDecline">Reason for Decline</Label>
                <Textarea
                  id="reasonForDecline"
                  name="reasonForDecline"
                  rows={3}
                  required
                  className="mt-1"
                />
                {fetcher.data?.errors?.reasonForDecline && (
                  <p className="mt-1 text-sm text-destructive">
                    {fetcher.data.errors.reasonForDecline}
                  </p>
                )}
              </div>
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => declineDialog.current?.close()}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={isSubmitting}>
                  Decline
                </Button>
              </div>
            </fetcher.Form>
          </ConfirmDialog>
        </div>
      )}
    </div>
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let title = "Something went wrong";
  let message = "An unexpected error occurred.";

  if (isRouteErrorResponse(error)) {
    title =
      error.status === 401
        ? "Sign in required"
        : error.status === 403
          ? "Access denied"
          : error.status === 404
            ? "Not found"
            : `Error ${error.status}`;
    message = typeof error.data === "string" ? error.data : error.statusText;
  }

  return (
    <div className="flex min-h-[50vh] items-center justify-center p-6">
      <div className="text-center">
        <AlertTriangle className="mx-auto mb-4 size-12 text-muted-foreground" />
        <h1 className="mb-2 text-2xl font-bold">{title}</h1>
        <p className="mb-6 text-muted-foreground">{message}</p>
        <Link to="/admin/refund-requests">
          <Button>Back to Refund Requests</Button>
        </Link>
      </div>
    </div>
  );
}
