import { expect } from "chai";
import hre from "hardhat";
import { getAddress, parseEther, stringToHex } from "viem";
import EduQuizModule from "../ignition/modules/EduQuiz";

describe("EduQuiz with module", function () {
    async function deployEduQuizModuleFixture() {
        const [owner, teacher, student1, student2] = await hre.viem.getWalletClients();
        const pubClient = await hre.viem.getPublicClient();
        
        const eduQuizContract = await hre.ignition.deploy(EduQuizModule, {
            parameters: {
                EduQuizModule: {
                    initialOwner: getAddress(owner.account.address)
                }
            }
        });

        const TEACHER_ROLE = stringToHex("TEACHER_ROLE", { size: 32 });
        const STUDENT_ROLE = stringToHex("STUDENT_ROLE", { size: 32 });

        // Setup teacher role by default
    
        
        await eduQuizContract.EduQuiz.write.setUserRole([
            TEACHER_ROLE, 
            getAddress(teacher.account.address)
        ]);

        return { 
            eduQuizContract, 
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
        const { eduQuizContract, owner } = await deployEduQuizModuleFixture();
        expect(await eduQuizContract.EduQuiz.read.owner()).to.equal(getAddress(owner.account.address));
    });

    describe("Role Management", function () {
        it("should grant teacher role", async function () {
            const { eduQuizContract, owner, teacher, TEACHER_ROLE } = await deployEduQuizModuleFixture();

            await eduQuizContract.EduQuiz.write.setUserRole([TEACHER_ROLE, getAddress(teacher.account.address)]);
            
            const hasRole = await eduQuizContract.EduQuiz.read.hasRole([
                TEACHER_ROLE, 
                getAddress(teacher.account.address)
            ]);
            expect(hasRole).to.be.true;
        });

        it("should fail when non-owner tries to grant role", async function () {
            const { 
                eduQuizContract, 
                teacher, 
                student1, 
                TEACHER_ROLE,
                pubClient 
            } = await deployEduQuizModuleFixture();

            try {
                const { request } = await pubClient.simulateContract({
                    address: getAddress(eduQuizContract.EduQuiz.address),
                    abi: eduQuizContract.EduQuiz.abi,
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
                eduQuizContract, 
                teacher, 
                pubClient, 
                TEACHER_ROLE 
            } = await deployEduQuizModuleFixture();

            // Grant teacher role
            await eduQuizContract.EduQuiz.write.setUserRole([
                TEACHER_ROLE, 
                getAddress(teacher.account.address)
            ]);

            const startTime = BigInt(Math.floor(Date.now() / 1000) + 3600);
            const endTime = startTime + BigInt(7200);

            const createQuiz = async () => {
                const { request } = await pubClient.simulateContract({
                    address: getAddress(eduQuizContract.EduQuiz.address),
                    abi: eduQuizContract.EduQuiz.abi,
                    functionName: 'createQuiz',
                    account: getAddress(teacher.account.address),
                    args: ["Test Quiz", parseEther('0.01'), startTime, endTime],
                    value: parseEther('0.0001')
                });

                await teacher.writeContract(request);
            };

            await createQuiz();

            const quizDetails = await eduQuizContract.EduQuiz.read.getQuizDetails([0n]);
            expect(quizDetails[1]).to.equal("Test Quiz"); // name
            expect(quizDetails[6]).to.be.true; // isActive
        });

        it("should allow students to join quiz", async function () {
            const { 
                eduQuizContract, 
                teacher, 
                student1, 
                pubClient, 
                TEACHER_ROLE 
            } = await deployEduQuizModuleFixture();

            // Grant teacher role
            await eduQuizContract.EduQuiz.write.setUserRole([
                TEACHER_ROLE, 
                getAddress(teacher.account.address)
            ]);

            // Create quiz
            const startTime = BigInt(Math.floor(Date.now() / 1000) + 3600);
            const endTime = startTime + BigInt(7200);
            const entryFee = parseEther('0.01');

            await eduQuizContract.EduQuiz.write.createQuiz([
                "Test Quiz", 
                entryFee, 
                startTime, 
                endTime
            ], { value: parseEther('0.0001') });

            // Join quiz
            const joinQuiz = async () => {
                const { request } = await pubClient.simulateContract({
                    address: getAddress(eduQuizContract.EduQuiz.address),
                    abi: eduQuizContract.EduQuiz.abi,
                    functionName: 'joinQuiz',
                    account: getAddress(student1.account.address),
                    args: [0n],
                    value: entryFee
                });

                await student1.writeContract(request);
            };

            await joinQuiz();

            const quizDetails = await eduQuizContract.EduQuiz.read.getQuizDetails([0n]);
            expect(quizDetails[8]).to.equal(1n); // participantCount
        });
    });

    describe("Quiz Completion and Prize Distribution", function () {
        it("should distribute prize to winner correctly", async function () {
            const { 
                eduQuizContract, 
                owner, 
                teacher, 
                student1, 
                student2, 
                pubClient, 
                STUDENT_ROLE,
                TEACHER_ROLE
            } = await deployEduQuizModuleFixture();

            // Grant roles using owner account
            await eduQuizContract.EduQuiz.write.grantRole([
                TEACHER_ROLE, 
                getAddress(teacher.account.address)
            ]);
            await eduQuizContract.EduQuiz.write.grantRole([
                STUDENT_ROLE, 
                getAddress(student1.account.address)
            ]);
            await eduQuizContract.EduQuiz.write.grantRole([
                STUDENT_ROLE, 
                getAddress(student2.account.address)
            ]);

            const startTime = BigInt(Math.floor(Date.now() / 1000) + 3600);
            const endTime = startTime + BigInt(1);
            const entryFee = parseEther('0.01');

            // Create quiz (using teacher account)
            const createQuiz = async () => {
                const { request } = await pubClient.simulateContract({
                    address: getAddress(eduQuizContract.EduQuiz.address),
                    abi: eduQuizContract.EduQuiz.abi,
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
                    address: getAddress(eduQuizContract.EduQuiz.address),
                    abi: eduQuizContract.EduQuiz.abi,
                    functionName: 'joinQuiz',
                    account: getAddress(student.account.address),
                    args: [0n],
                    value: entryFee
                });
                await student.writeContract(request);
            }

            // Wait until quiz ends
            await hre.network.provider.send("evm_increaseTime", [3700]); // Increase time by more than startTime + 1
            await hre.network.provider.send("evm_mine");

            // End quiz and distribute prize
            const endQuiz = async () => {
                const { request } = await pubClient.simulateContract({
                    address: getAddress(eduQuizContract.EduQuiz.address),
                    abi: eduQuizContract.EduQuiz.abi,
                    functionName: 'endQuiz',
                    account: getAddress(teacher.account.address),
                    args: [0n, getAddress(student1.account.address)]
                });
                await teacher.writeContract(request);
            };

            await endQuiz();

            const quizDetails = await eduQuizContract.EduQuiz.read.getQuizDetails([0n]);
            expect(quizDetails[7]).to.equal(getAddress(student1.account.address)); // winner
            expect(quizDetails[6]).to.be.false; // isActive should be false
        });
    });

    describe("Quiz Cancellation", function () {
        it("should cancel quiz and refund participants", async function () {
            const { 
                eduQuizContract, 
                teacher, 
                student1, 
                pubClient, 
                TEACHER_ROLE 
            } = await deployEduQuizModuleFixture();

            await eduQuizContract.EduQuiz.write.setUserRole([
                TEACHER_ROLE, 
                getAddress(teacher.account.address)
            ]);

            // Set start time far enough in future
            const startTime = BigInt(Math.floor(Date.now() / 1000) + 7200); // 2 hours from now
            const endTime = startTime + BigInt(7200);    // 4 hours from now
            const entryFee = parseEther('0.01');

            // Create quiz
            const createQuiz = async () => {
                const { request } = await pubClient.simulateContract({
                    address: getAddress(eduQuizContract.EduQuiz.address),
                    abi: eduQuizContract.EduQuiz.abi,
                    functionName: 'createQuiz',
                    account: getAddress(teacher.account.address),
                    args: ["Cancellation Test Quiz", entryFee, startTime, endTime],
                    value: parseEther('0.0001')
                });
                await teacher.writeContract(request);
            };

            await createQuiz();

            // Student joins
            const joinQuiz = async () => {
                const { request } = await pubClient.simulateContract({
                    address: getAddress(eduQuizContract.EduQuiz.address),
                    abi: eduQuizContract.EduQuiz.abi,
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
                    address: getAddress(eduQuizContract.EduQuiz.address),
                    abi: eduQuizContract.EduQuiz.abi,
                    functionName: 'cancelQuiz',
                    account: getAddress(teacher.account.address),
                    args: [0n]
                });
                await teacher.writeContract(request);
            };

            await cancelQuiz();

            const quizDetails = await eduQuizContract.EduQuiz.read.getQuizDetails([0n]);
            expect(quizDetails[6]).to.be.false; // isActive
        });
    });

    describe("Course Management", function () {
        it("should create and retrieve course", async function () {
            const { 
                eduQuizContract, 
                teacher, 
                TEACHER_ROLE 
            } = await deployEduQuizModuleFixture();

            await eduQuizContract.EduQuiz.write.setUserRole([
                TEACHER_ROLE, 
                getAddress(teacher.account.address)
            ]);

            const createCourse = async () => {
                await eduQuizContract.EduQuiz.write.createCourse([
                    "Test Course",
                    parseEther('0.1')
                ]);
            };

            await createCourse();

            const course = await eduQuizContract.EduQuiz.read.getCourse([1n]);
            expect(course.name).to.equal("Test Course");
            expect(course.price).to.equal(parseEther('0.1'));
        });
    });

    describe("Event Management", function () {
        it("should create and retrieve event", async function () {
            const { 
                eduQuizContract, 
                teacher, 
                TEACHER_ROLE 
            } = await deployEduQuizModuleFixture();

            await eduQuizContract.EduQuiz.write.setUserRole([
                TEACHER_ROLE, 
                getAddress(teacher.account.address)
            ]);

            const eventDate = BigInt(Math.floor(Date.now() / 1000) + 86400); // 24 hours from now

            const createEvent = async () => {
                await eduQuizContract.EduQuiz.write.createEvent([
                    "Test Event",
                    parseEther('0.05'),
                    eventDate
                ]);
            };

            await createEvent();

            const event = await eduQuizContract.EduQuiz.read.getEvent([1n]);
            expect(event.name).to.equal("Test Event");
            expect(event.price).to.equal(parseEther('0.05'));
            expect(event.eventStartDate).to.equal(eventDate);
        });
    });

    describe("Security Features", function () {
        it("should pause and unpause contract", async function () {
            const { 
                eduQuizContract, 
                owner, 
                teacher, 
                TEACHER_ROLE 
            } = await deployEduQuizModuleFixture();


            await eduQuizContract.EduQuiz.write.setUserRole([
                TEACHER_ROLE, 
                getAddress(teacher.account.address)
            ]);

            // Pause contract
            await eduQuizContract.EduQuiz.write.pause();

            // Try to create course while paused
            try {
                await eduQuizContract.EduQuiz.write.createCourse([
                    "Test Course",
                    parseEther('0.1')
                ]);
            } catch (error: any) {
                expect(error.message).include(['EnforcedPause']);
            }

            // Unpause contract
            await eduQuizContract.EduQuiz.write.unpause();
            
            await eduQuizContract.EduQuiz.write.createCourse([
                "Test Course",
                parseEther('0.1')
            ]);
        });

        it("should prevent unauthorized role assignments", async function () {
            const { 
                eduQuizContract, 
                student1, 
                student2, 
                TEACHER_ROLE,
                pubClient 
            } = await deployEduQuizModuleFixture();

            try {
                const { request } = await pubClient.simulateContract({
                    address: getAddress(eduQuizContract.EduQuiz.address),
                    abi: eduQuizContract.EduQuiz.abi,
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
            const { eduQuizContract, student1, pubClient } = await deployEduQuizModuleFixture();

            const startTime = BigInt(Math.floor(Date.now() / 1000) + 3600);
            const endTime = startTime + BigInt(7200);

            await eduQuizContract.EduQuiz.write.createQuiz([
                "Late Join Test", 
                parseEther('0.01'), 
                startTime, 
                endTime
            ], { value: parseEther('0.0001') });

            try {
                const { request } = await pubClient.simulateContract({
                    address: getAddress(eduQuizContract.EduQuiz.address),
                    abi: eduQuizContract.EduQuiz.abi,
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

    describe("Additional Role Management", function () {
        it("should revoke user role", async function () {
            const { eduQuizContract, teacher, TEACHER_ROLE } = await deployEduQuizModuleFixture();

            await eduQuizContract.EduQuiz.write.revokeUserRole([
                TEACHER_ROLE, 
                getAddress(teacher.account.address)
            ]);

            const hasRole = await eduQuizContract.EduQuiz.read.hasRole([
                TEACHER_ROLE, 
                getAddress(teacher.account.address)
            ]);
            expect(hasRole).to.be.false;
        });
    });
}); 