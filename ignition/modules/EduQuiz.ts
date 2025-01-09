import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

const EduQuizModule = buildModule("EduQuizModule", (m) => {
  const EduQuiz = m.contract("EduQuiz", [m.getParameter("initialOwner")]);

  return { EduQuiz };
});

export default EduQuizModule; 