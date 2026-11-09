import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "~/db";
import {
  categories,
  courses,
  CourseStatus,
  enrollments,
  lessonProgress,
  lessons,
  LessonProgressStatus,
  modules,
  purchases,
  quizAttempts,
  quizzes,
  refundRequests,
  UserRole,
  users,
  videoWatchEvents,
} from "~/db/schema";
import {
  getCourseQuizPassRates,
  getRecentlyProgressedCourses,
} from "~/lib/enrolled-progress.server";
import {
  approveRefundRequest,
  getCourseProgress,
  getRefundRequestDetail,
} from "~/lib/refund-requests.server";
import { getCurrentUserId } from "~/lib/session";
import { action } from "~/routes/courses.$slug.refund";

vi.mock("~/db", async () => {
  const { default: Database } = await import("better-sqlite3");
  const { drizzle } = await import("drizzle-orm/better-sqlite3");
  const { migrate } = await import("drizzle-orm/better-sqlite3/migrator");
  const schema = await import("~/db/schema");

  const sqlite = new Database(":memory:");
  sqlite.pragma("foreign_keys = ON");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: "drizzle" });
  return { db, getSqlite: () => sqlite };
});

vi.mock("~/lib/session", () => ({ getCurrentUserId: vi.fn() }));

const BEFORE_DECISION = "2020-01-01T00:00:00.000Z";
const AFTER_DECISION = "2999-01-01T00:00:00.000Z";

let uniqueCounter = 0;
let supportTeamMember: number;
let learner: number;
let courseId: number;
let courseSlug: string;
let lessonIds: number[];

function createUser(role = UserRole.Student) {
  uniqueCounter += 1;
  return db
    .insert(users)
    .values({
      name: `Person ${uniqueCounter}`,
      email: `progress-${uniqueCounter}@example.com`,
      role,
    })
    .returning()
    .get().id;
}

function createCourse(lessonCount: number) {
  uniqueCounter += 1;
  const category = db
    .insert(categories)
    .values({ name: "Topic", slug: `progress-topic-${uniqueCounter}` })
    .returning()
    .get().id;
  const course = db
    .insert(courses)
    .values({
      title: `Course ${uniqueCounter}`,
      slug: `progress-course-${uniqueCounter}`,
      description: "A course",
      salesCopy: "Buy it.",
      instructorId: supportTeamMember,
      categoryId: category,
      status: CourseStatus.Published,
      price: 7900,
    })
    .returning()
    .get();
  const module = db
    .insert(modules)
    .values({ courseId: course.id, title: "One", position: 1 })
    .returning()
    .get().id;
  const ids = Array.from(
    { length: lessonCount },
    (_, index) =>
      db
        .insert(lessons)
        .values({ moduleId: module, title: `L${index}`, position: index })
        .returning()
        .get().id
  );
  return { id: course.id, slug: course.slug, lessonIds: ids };
}

function enroll(userId: number, course: number) {
  db.insert(enrollments).values({ userId, courseId: course }).run();
}

function buy(userId: number, course: number) {
  return db
    .insert(purchases)
    .values({ userId, courseId: course, amountPaid: 7900 })
    .returning()
    .get().id;
}

function raiseRefundRequest(purchaseId: number) {
  return db
    .insert(refundRequests)
    .values({ purchaseId, reason: "It was not what I expected." })
    .returning()
    .get().id;
}

function completeLesson(userId: number, lessonId: number, completedAt: string) {
  db.insert(lessonProgress)
    .values({
      userId,
      lessonId,
      status: LessonProgressStatus.Completed,
      completedAt,
    })
    .run();
}

function watch(
  userId: number,
  lessonId: number,
  positions: number[],
  createdAt: string
) {
  for (const positionSeconds of positions) {
    db.insert(videoWatchEvents)
      .values({
        userId,
        lessonId,
        eventType: "progress",
        positionSeconds,
        createdAt,
      })
      .run();
  }
}

function everyTenSeconds(fromSeconds: number, toSeconds: number) {
  const positions: number[] = [];
  for (let at = fromSeconds; at <= toSeconds; at += 10) positions.push(at);
  return positions;
}

function submitRefundRequest() {
  const body = new FormData();
  body.set("reason", "It was not what I expected.");
  return action({
    params: { slug: courseSlug },
    request: new Request("http://localhost/refund", { method: "POST", body }),
  } as unknown as Parameters<typeof action>[0]);
}

function refundRequestCount(purchaseId: number) {
  return db
    .select()
    .from(refundRequests)
    .where(eq(refundRequests.purchaseId, purchaseId))
    .all().length;
}

beforeEach(() => {
  vi.spyOn(console, "log").mockImplementation(() => {});
  supportTeamMember = createUser(UserRole.Admin);
  learner = createUser();
  const course = createCourse(4);
  courseId = course.id;
  courseSlug = course.slug;
  lessonIds = course.lessonIds;
  vi.mocked(getCurrentUserId).mockResolvedValue(learner);
});

describe("Progress on a course", () => {
  it("counts only distinct video towards Watch Time", () => {
    const [lesson] = lessonIds;
    watch(learner, lesson, everyTenSeconds(0, 600), BEFORE_DECISION);
    watch(learner, lesson, everyTenSeconds(0, 300), BEFORE_DECISION);

    expect(getCourseProgress(learner, courseId).watchTimeSeconds).toBe(600);
  });

  it("does not count video the Learner skipped", () => {
    const [lesson] = lessonIds;
    watch(learner, lesson, [0, 10, 2400, 2410], BEFORE_DECISION);

    expect(getCourseProgress(learner, courseId).watchTimeSeconds).toBe(20);
  });
});

describe("raising a Refund Request past a Refund Limit", () => {
  it("is refused once half the lessons are completed", async () => {
    const purchase = buy(learner, courseId);
    enroll(learner, courseId);
    completeLesson(learner, lessonIds[0], BEFORE_DECISION);
    completeLesson(learner, lessonIds[1], BEFORE_DECISION);

    await expect(submitRefundRequest()).rejects.toMatchObject({
      init: { status: 403 },
    });
    expect(refundRequestCount(purchase)).toBe(0);
  });

  it("is refused at two hours of Watch Time", async () => {
    const purchase = buy(learner, courseId);
    enroll(learner, courseId);
    watch(learner, lessonIds[0], everyTenSeconds(0, 7200), BEFORE_DECISION);

    await expect(submitRefundRequest()).rejects.toMatchObject({
      init: { status: 403 },
    });
    expect(refundRequestCount(purchase)).toBe(0);
  });

  it("is allowed when skipping ahead left Watch Time under the limit", async () => {
    const purchase = buy(learner, courseId);
    enroll(learner, courseId);
    watch(learner, lessonIds[0], [0, 10, 7200, 7210], BEFORE_DECISION);

    await submitRefundRequest();

    expect(refundRequestCount(purchase)).toBe(1);
  });

  it("counts Progress from before an earlier Refund", async () => {
    const firstPurchase = buy(learner, courseId);
    enroll(learner, courseId);
    completeLesson(learner, lessonIds[0], BEFORE_DECISION);
    completeLesson(learner, lessonIds[1], BEFORE_DECISION);
    const id = raiseRefundRequest(firstPurchase);
    approveRefundRequest(id, supportTeamMember);

    const secondPurchase = buy(learner, courseId);
    enroll(learner, courseId);

    await expect(submitRefundRequest()).rejects.toMatchObject({
      init: { status: 403 },
    });
    expect(refundRequestCount(secondPurchase)).toBe(0);
  });
});

describe("Progress shown on a Refund Request", () => {
  it("is live while the Refund Request is Open", () => {
    const id = raiseRefundRequest(buy(learner, courseId));
    enroll(learner, courseId);
    completeLesson(learner, lessonIds[0], AFTER_DECISION);

    expect(getRefundRequestDetail(id)?.progress.lessonsCompleted).toBe(1);
  });

  it("stays as it was at the decision when the Learner studies later", () => {
    const id = raiseRefundRequest(buy(learner, courseId));
    enroll(learner, courseId);
    completeLesson(learner, lessonIds[0], BEFORE_DECISION);
    watch(learner, lessonIds[0], [0, 10], BEFORE_DECISION);
    approveRefundRequest(id, supportTeamMember);

    completeLesson(learner, lessonIds[1], AFTER_DECISION);
    watch(learner, lessonIds[1], [0, 10, 20], AFTER_DECISION);

    expect(getRefundRequestDetail(id)?.progress).toEqual({
      watchTimeSeconds: 10,
      lessonsCompleted: 1,
      totalLessons: 4,
    });
  });
});

describe("after an Enrollment ends", () => {
  it("drops the course from the Learner's recent courses until they return", () => {
    enroll(learner, courseId);
    completeLesson(learner, lessonIds[0], BEFORE_DECISION);
    const purchase = buy(learner, courseId);
    expect(getRecentlyProgressedCourses(learner)).toHaveLength(1);

    approveRefundRequest(raiseRefundRequest(purchase), supportTeamMember);
    expect(getRecentlyProgressedCourses(learner)).toHaveLength(0);

    enroll(learner, courseId);
    expect(getRecentlyProgressedCourses(learner)).toHaveLength(1);
  });

  it("leaves the Learner out of quiz pass rates", () => {
    const quiz = db
      .insert(quizzes)
      .values({ lessonId: lessonIds[0], title: "Quiz", passingScore: 0.5 })
      .returning()
      .get().id;
    const stayed = createUser();
    enroll(stayed, courseId);
    enroll(learner, courseId);
    const purchase = buy(learner, courseId);
    for (const [userId, score, passed] of [
      [stayed, 1, true],
      [learner, 0, false],
    ] as const) {
      db.insert(quizAttempts).values({ userId, quizId: quiz, score, passed }).run();
    }

    approveRefundRequest(raiseRefundRequest(purchase), supportTeamMember);

    expect(getCourseQuizPassRates(courseId, "all")[0]).toMatchObject({
      studentCount: 1,
      passedCount: 1,
      passRatePercent: 100,
    });
  });
});
