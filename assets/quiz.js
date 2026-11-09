// Reusable quiz. Markup:
//   <div class="quiz" data-correct="2">
//     <p class="quiz-prompt">…</p>
//     <div class="quiz-options"><button>…</button>…</div>
//     <p class="quiz-why">…</p>
//   </div>
//   <p class="quiz-score"></p>
// data-correct is the zero-based position of the right answer.

document.addEventListener("DOMContentLoaded", () => {
  const quizzes = [...document.querySelectorAll(".quiz")];
  const score = document.querySelector(".quiz-score");
  let answered = 0;
  let right = 0;

  for (const quiz of quizzes) {
    const correct = Number(quiz.dataset.correct);
    const buttons = [...quiz.querySelectorAll(".quiz-options button")];

    buttons.forEach((button, index) => {
      button.type = "button";
      button.addEventListener("click", () => {
        buttons.forEach((b) => (b.disabled = true));
        buttons[correct].classList.add("correct");
        if (index !== correct) button.classList.add("wrong");
        quiz.classList.add("answered");

        answered += 1;
        if (index === correct) right += 1;
        if (score) {
          score.textContent =
            answered === quizzes.length
              ? `${right} of ${quizzes.length} correct. Reload to try again from memory.`
              : `${answered} of ${quizzes.length} answered.`;
        }
      });
    });
  }
});
