import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

const EduQuitzModule = buildModule("EduQuitzModule", (m) => {
  const eduQuitz = m.contract("EduQuitz", [m.getParameter("initialOwner")]);

  return { eduQuitz };
});

export default EduQuitzModule; 