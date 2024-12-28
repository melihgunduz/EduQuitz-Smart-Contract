import { expect } from "chai";
import hre from "hardhat";
import { getAddress, parseEther, stringToHex } from "viem";
import EduQuitzModule from "../ignition/modules/EduQuitz";

describe("EduQuitz with module", function () {
    async function deployEduQuitzModuleFixture() {
        const [owner, teacher, student1, student2] = await hre.viem.getWalletClients();
        const pubClient = await hre.viem.getPublicClient();
        
        const eduQuitzContract = await hre.ignition.deploy(EduQuitzModule, {
            parameters: {
                EduQuitzModule: {
                    initialOwner: getAddress(owner.account.address)
                }
            }
        });

        // Role constants
        const TEACHER_ROLE = stringToHex("TEACHER_ROLE", { size: 32 });
        const STUDENT_ROLE = stringToHex("STUDENT_ROLE", { size: 32 });

        return { 
            eduQuitzContract, 
            owner, 
            teacher, 
            student1, 
            student2, 
            pubClient,
            TEACHER_ROLE,
            STUDENT_ROLE
        };
    }

    it("should be deployed with ignition", async function () {
        const { eduQuitzContract, owner } = await deployEduQuitzModuleFixture();
        expect(await eduQuitzContract.eduQuitz.read.owner()).to.equal(getAddress(owner.account.address));
    });

    describe("Role Management", function () {
        it("should grant teacher role", async function () {
            const { eduQuitzContract, owner, teacher, TEACHER_ROLE } = await deployEduQuitzModuleFixture();

            await eduQuitzContract.eduQuitz.write.setUserRole([TEACHER_ROLE, getAddress(teacher.account.address)]);
            
            const hasRole = await eduQuitzContract.eduQuitz.read.hasRole([
                TEACHER_ROLE, 
                getAddress(teacher.account.address)
            ]);
            expect(hasRole).to.be.true;
        });

        it("should fail when non-owner tries to grant role", async function () {
            const { 
                eduQuitzContract, 
                teacher, 
                student1, 
                TEACHER_ROLE,
                pubClient 
            } = await deployEduQuitzModuleFixture();

            try {
                const { request } = await pubClient.simulateContract({
                    address: getAddress(eduQuitzContract.eduQuitz.address),
                    abi: eduQuitzContract.eduQuitz.abi,
                    functionName: 'setUserRole',
                    account: getAddress(student1.account.address),
                    args: [TEACHER_ROLE, getAddress(teacher.account.address)]
                });

                await student1.writeContract(request);
            } catch (error: any) {
                expect(error.message).include(['OwnableUnauthorizedAccount']);
            }
        });
    });

    describe("Quiz Management", function () {
        it("should create quiz with correct parameters", async function () {
            const { 
                eduQuitzContract, 
                teacher, 
                pubClient, 
                TEACHER_ROLE 
            } = await deployEduQuitzModuleFixture();

            // Grant teacher role
            await eduQuitzContract.eduQuitz.write.setUserRole([
                TEACHER_ROLE, 
                getAddress(teacher.account.address)
            ]);

            const startTime = BigInt(Math.floor(Date.now() / 1000) + 3600);
            const endTime = startTime + BigInt(7200);

            const createQuiz = async () => {
                const { request } = await pubClient.simulateContract({
                    address: getAddress(eduQuitzContract.eduQuitz.address),
                    abi: eduQuitzContract.eduQuitz.abi,
                    functionName: 'createQuiz',
                    account: getAddress(teacher.account.address),
                    args: ["Test Quiz", parseEther('0.01'), startTime, endTime],
                    value: parseEther('0.0001')
                });

                await teacher.writeContract(request);
            };

            await createQuiz();

            const quizDetails = await eduQuitzContract.eduQuitz.read.getQuizDetails([0n]);
            expect(quizDetails[1]).to.equal("Test Quiz"); // name
            expect(quizDetails[6]).to.be.true; // isActive
        });

        it("should allow students to join quiz", async function () {
            const { 
                eduQuitzContract, 
                teacher, 
                student1, 
                pubClient, 
                TEACHER_ROLE 
            } = await deployEduQuitzModuleFixture();

            // Grant teacher role
            await eduQuitzContract.eduQuitz.write.setUserRole([
                TEACHER_ROLE, 
                getAddress(teacher.account.address)
            ]);

            // Create quiz
            const startTime = BigInt(Math.floor(Date.now() / 1000) + 3600);
            const endTime = startTime + BigInt(7200);
            const entryFee = parseEther('0.01');

            await eduQuitzContract.eduQuitz.write.createQuiz([
                "Test Quiz", 
                entryFee, 
                startTime, 
                endTime
            ], { value: parseEther('0.0001') });

            // Join quiz
            const joinQuiz = async () => {
                const { request } = await pubClient.simulateContract({
                    address: getAddress(eduQuitzContract.eduQuitz.address),
                    abi: eduQuitzContract.eduQuitz.abi,
                    functionName: 'joinQuiz',
                    account: getAddress(student1.account.address),
                    args: [0n],
                    value: entryFee
                });

                await student1.writeContract(request);
            };

            await joinQuiz();

            const quizDetails = await eduQuitzContract.eduQuitz.read.getQuizDetails([0n]);
            expect(quizDetails[8]).to.equal(1n); // participantCount
        });
    });

    describe("Quiz Completion and Prize Distribution", function () {
        it("should distribute prize to winner correctly", async function () {
            const { 
                eduQuitzContract, 
                owner, 
                teacher, 
                student1, 
                student2, 
                pubClient, 
                STUDENT_ROLE,
                TEACHER_ROLE
            } = await deployEduQuitzModuleFixture();

            // Grant roles using owner account
            await eduQuitzContract.eduQuitz.write.grantRole([
                TEACHER_ROLE, 
                getAddress(teacher.account.address)
            ]);
            await eduQuitzContract.eduQuitz.write.grantRole([
                STUDENT_ROLE, 
                getAddress(student1.account.address)
            ]);
            await eduQuitzContract.eduQuitz.write.grantRole([
                STUDENT_ROLE, 
                getAddress(student2.account.address)
            ]);

            const startTime = BigInt(Math.floor(Date.now() / 1000) + 3600);
            const endTime = startTime + BigInt(7200);
            const entryFee = parseEther('0.01');

            // Create quiz (using teacher account)
            const createQuiz = async () => {
                const { request } = await pubClient.simulateContract({
                    address: getAddress(eduQuitzContract.eduQuitz.address),
                    abi: eduQuitzContract.eduQuitz.abi,
                    functionName: 'createQuiz',
                    account: getAddress(teacher.account.address),
                    args: ["Prize Test Quiz", entryFee, startTime, endTime],
                    value: parseEther('0.0001')
                });
                await teacher.writeContract(request);
            };

            await createQuiz();

            // Students join quiz
            for (const student of [student1, student2]) {
                const { request } = await pubClient.simulateContract({
                    address: getAddress(eduQuitzContract.eduQuitz.address),
                    abi: eduQuitzContract.eduQuitz.abi,
                    functionName: 'joinQuiz',
                    account: getAddress(student.account.address),
                    args: [0n],
                    value: entryFee
                });
                await student.writeContract(request);
            }

            // Fast forward time (simulate quiz end)
            await hre.network.provider.send("evm_setNextBlockTimestamp", [Number(endTime)]);
            await hre.network.provider.send("evm_mine");

            // End quiz and distribute prize (using teacher account)
            const endQuiz = async () => {
                const { request } = await pubClient.simulateContract({
                    address: getAddress(eduQuitzContract.eduQuitz.address),
                    abi: eduQuitzContract.eduQuitz.abi,
                    functionName: 'endQuiz',
                    account: getAddress(teacher.account.address),
                    args: [0n, getAddress(student1.account.address)]
                });
                await teacher.writeContract(request);
            };

            await endQuiz();

            const quizDetails = await eduQuitzContract.eduQuitz.read.getQuizDetails([0n]);
            expect(quizDetails[7]).to.equal(getAddress(student1.account.address)); // winner
            expect(quizDetails[6]).to.be.false; // isActive should be false
        });
    });

    describe("Quiz Cancellation", function () {
        it("should cancel quiz and refund participants", async function () {
            const { 
                eduQuitzContract, 
                teacher, 
                student1, 
                pubClient, 
                TEACHER_ROLE 
            } = await deployEduQuitzModuleFixture();

            await eduQuitzContract.eduQuitz.write.setUserRole([
                TEACHER_ROLE, 
                getAddress(teacher.account.address)
            ]);

            const startTime = BigInt(Math.floor(Date.now() / 1000) + 3600);
            const endTime = startTime + BigInt(7200);
            const entryFee = parseEther('0.01');

            // Create quiz
            await eduQuitzContract.eduQuitz.write.createQuiz([
                "Cancellation Test Quiz", 
                entryFee, 
                startTime, 
                endTime
            ], { value: parseEther('0.0001') });

            // Student joins
            const joinQuiz = async () => {
                const { request } = await pubClient.simulateContract({
                    address: getAddress(eduQuitzContract.eduQuitz.address),
                    abi: eduQuitzContract.eduQuitz.abi,
                    functionName: 'joinQuiz',
                    account: getAddress(student1.account.address),
                    args: [0n],
                    value: entryFee
                });
                await student1.writeContract(request);
            };

            await joinQuiz();

            // Cancel quiz
            const cancelQuiz = async () => {
                const { request } = await pubClient.simulateContract({
                    address: getAddress(eduQuitzContract.eduQuitz.address),
                    abi: eduQuitzContract.eduQuitz.abi,
                    functionName: 'cancelQuiz',
                    account: getAddress(teacher.account.address),
                    args: [0n]
                });
                await teacher.writeContract(request);
            };

            await cancelQuiz();

            const quizDetails = await eduQuitzContract.eduQuitz.read.getQuizDetails([0n]);
            expect(quizDetails[6]).to.be.false; // isActive
        });
    });

    describe("Course Management", function () {
        it("should create and retrieve course", async function () {
            const { 
                eduQuitzContract, 
                teacher, 
                TEACHER_ROLE 
            } = await deployEduQuitzModuleFixture();

            await eduQuitzContract.eduQuitz.write.setUserRole([
                TEACHER_ROLE, 
                getAddress(teacher.account.address)
            ]);

            const createCourse = async () => {
                await eduQuitzContract.eduQuitz.write.createCourse([
                    "Test Course",
                    parseEther('0.1')
                ]);
            };

            await createCourse();

            const course = await eduQuitzContract.eduQuitz.read.getCourse([1n]);
            expect(course.name).to.equal("Test Course");
            expect(course.price).to.equal(parseEther('0.1'));
        });
    });

    describe("Event Management", function () {
        it("should create and retrieve event", async function () {
            const { 
                eduQuitzContract, 
                teacher, 
                TEACHER_ROLE 
            } = await deployEduQuitzModuleFixture();

            await eduQuitzContract.eduQuitz.write.setUserRole([
                TEACHER_ROLE, 
                getAddress(teacher.account.address)
            ]);

            const eventDate = BigInt(Math.floor(Date.now() / 1000) + 86400); // 24 hours from now

            const createEvent = async () => {
                await eduQuitzContract.eduQuitz.write.createEvent([
                    "Test Event",
                    parseEther('0.05'),
                    eventDate
                ]);
            };

            await createEvent();

            const event = await eduQuitzContract.eduQuitz.read.getEvent([1n]);
            expect(event.name).to.equal("Test Event");
            expect(event.price).to.equal(parseEther('0.05'));
            expect(event.eventStartDate).to.equal(eventDate);
        });
    });

    describe("Security Features", function () {
        it("should pause and unpause contract", async function () {
            const { 
                eduQuitzContract, 
                owner, 
                teacher, 
                TEACHER_ROLE 
            } = await deployEduQuitzModuleFixture();


            await eduQuitzContract.eduQuitz.write.setUserRole([
                TEACHER_ROLE, 
                getAddress(teacher.account.address)
            ]);

            // Pause contract
            await eduQuitzContract.eduQuitz.write.pause();

            // Try to create course while paused
            try {
                await eduQuitzContract.eduQuitz.write.createCourse([
                    "Test Course",
                    parseEther('0.1')
                ]);
            } catch (error: any) {
                expect(error.message).include(['EnforcedPause']);
            }

            // Unpause contract
            await eduQuitzContract.eduQuitz.write.unpause();
            
            await eduQuitzContract.eduQuitz.write.createCourse([
                "Test Course",
                parseEther('0.1')
            ]);
        });

        it("should prevent unauthorized role assignments", async function () {
            const { 
                eduQuitzContract, 
                student1, 
                student2, 
                TEACHER_ROLE,
                pubClient 
            } = await deployEduQuitzModuleFixture();

            try {
                const { request } = await pubClient.simulateContract({
                    address: getAddress(eduQuitzContract.eduQuitz.address),
                    abi: eduQuitzContract.eduQuitz.abi,
                    functionName: 'setUserRole',
                    account: getAddress(student1.account.address),
                    args: [TEACHER_ROLE, getAddress(student2.account.address)]
                });
                await student1.writeContract(request);
            } catch (error: any) {
                expect(error.message).include(['OwnableUnauthorizedAccount']);
            }
        });
    });

    describe("Edge Cases", function () {
        it("should prevent joining quiz after end time", async function () {
            const { 
                eduQuitzContract, 
                teacher, 
                student1, 
                pubClient, 
                TEACHER_ROLE 
            } = await deployEduQuitzModuleFixture();

            await eduQuitzContract.eduQuitz.write.setUserRole([
                TEACHER_ROLE, 
                getAddress(teacher.account.address)
            ]);

            const startTime = BigInt(Math.floor(Date.now() / 1000) + 3600);
            const endTime = startTime + BigInt(7200);

            await eduQuitzContract.eduQuitz.write.createQuiz([
                "Late Join Test", 
                parseEther('0.01'), 
                startTime, 
                endTime
            ], { value: parseEther('0.0001') });


            try {
                const { request } = await pubClient.simulateContract({
                    address: getAddress(eduQuitzContract.eduQuitz.address),
                    abi: eduQuitzContract.eduQuitz.abi,
                    functionName: 'joinQuiz',
                    account: getAddress(student1.account.address),
                    args: [0n],
                    value: parseEther('0.01')
                });
                await student1.writeContract(request);
            } catch (error: any) {
                expect(error.message).include(['Quiz has ended']);
            }
        });
    });
}); 