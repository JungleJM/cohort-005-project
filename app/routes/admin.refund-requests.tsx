import { data, isRouteErrorResponse, Link } from "react-router";
import { AlertTriangle } from "lucide-react";
import type { Route } from "./+types/admin.refund-requests";
import {
  listOpenRefundRequests,
  requireSupportTeamMember,
} from "~/lib/refund-requests.server";
import { formatPrice } from "~/lib/utils";
import { Button } from "~/components/ui/button";

export function meta() {
  return [
    { title: "Refund Requests — Cadence" },
    { name: "description", content: "Open Refund Requests to decide" },
  ];
}

export async function loader({ request }: Route.LoaderArgs) {
  await requireSupportTeamMember(request);

  return { refundRequests: listOpenRefundRequests() };
}

function earlierSummary(approved: number, declined: number) {
  const parts = [
    approved > 0 ? `${approved} Approved` : null,
    declined > 0 ? `${declined} Declined` : null,
  ].filter(Boolean);

  return parts.length > 0 ? parts.join(", ") : "None";
}

export default function AdminRefundRequests({
  loaderData,
}: Route.ComponentProps) {
  const { refundRequests } = loaderData;

  return (
    <div className="mx-auto max-w-7xl p-6 lg:p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Refund Requests</h1>
        <p className="mt-1 text-muted-foreground">
          Open Refund Requests waiting on a decision, oldest first
        </p>
      </div>

      {refundRequests.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No Open Refund Requests.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="px-4 py-3 text-left font-medium">Learner</th>
                <th className="px-4 py-3 text-left font-medium">Course</th>
                <th className="px-4 py-3 text-left font-medium">Amount paid</th>
                <th className="px-4 py-3 text-left font-medium">Raised</th>
                <th className="px-4 py-3 text-left font-medium">
                  Earlier Refund Requests
                </th>
              </tr>
            </thead>
            <tbody>
              {refundRequests.map((refundRequest) => (
                <tr key={refundRequest.id} className="border-b last:border-0">
                  <td className="px-4 py-3">
                    <Link
                      to={`/admin/refund-requests/${refundRequest.id}`}
                      className="font-medium hover:underline"
                    >
                      {refundRequest.learnerName}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {refundRequest.courseTitle}
                  </td>
                  <td className="px-4 py-3">
                    {formatPrice(refundRequest.amountPaid)}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {new Date(refundRequest.requestedAt).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {earlierSummary(
                      refundRequest.earlierApproved,
                      refundRequest.earlierDeclined
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
          : `Error ${error.status}`;
    message = typeof error.data === "string" ? error.data : error.statusText;
  }

  return (
    <div className="flex min-h-[50vh] items-center justify-center p-6">
      <div className="text-center">
        <AlertTriangle className="mx-auto mb-4 size-12 text-muted-foreground" />
        <h1 className="mb-2 text-2xl font-bold">{title}</h1>
        <p className="mb-6 text-muted-foreground">{message}</p>
        <Link to="/">
          <Button>Go Home</Button>
        </Link>
      </div>
    </div>
  );
}
