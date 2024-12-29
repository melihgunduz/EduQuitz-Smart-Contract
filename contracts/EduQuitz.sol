// SPDX-License-Identifier: UNLICENSED

pragma solidity >=0.8.20 <0.9.0;
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";




contract EduQuitz is AccessControl, Ownable, Pausable, ReentrancyGuard {
    uint256 private quizCounter;

    constructor(address initialOwner) Ownable(initialOwner){
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    bytes32 public constant EVENT_MANAGER_ROLE = keccak256("EVENT_MANAGER_ROLE");
    bytes32 public constant STUDENT_ROLE = keccak256("STUDENT_ROLE");
    bytes32 public constant TEACHER_ROLE = keccak256("TEACHER_ROLE");

    uint256 createCourseFee = 0.0001 ether;
    uint256 createEventFee = 0.0001 ether;
    uint256 createGameFee = 0.0001 ether;

    uint256 private lastCourseId = 0;
    uint256 private lastEventId = 0;
    uint256 private lastGameId = 0;

    struct Course{
        address creatorAddress;
        uint256 id;
        bool isClosed;
        string name;
        uint256 price;
    }

    struct Event{
        address creatorAddress;
        uint256 eventStartDate;
        uint256 id;
        string name;
        uint256 price;
    }

    struct Game{
        address creatorAddress;
        uint256 id;
        bool isClosed;
        string name;
    }

    struct User{
        address userAddress;
        uint256 id;
        Course[] courses;
        Event[] events;
        Game[] games;
        mapping(uint256 => uint256) gamePoints; // Mapping to store points for each game
    }

    struct Quiz {
        address creatorAddress;
        uint256 id;
        string name;
        uint256 entryFee;
        uint256 prizePool;
        uint256 startTime;
        uint256 endTime;
        bool isActive;
        address winner;
        uint256 participantCount;
        mapping(address => bool) participants;
        uint256 maxWinners;
        address[] winners;
        mapping(address => uint256) winnerScores;
    }

    struct QuizStats {
        uint256 totalParticipants;
        uint256 averageScore;
        uint256 topScore;
        address topScorer;
    }

    mapping(uint256 => Course) public courses;
    mapping(uint256 => Event) public events;
    mapping(uint256 => Game) public games;
    mapping(uint256 => Quiz) public quizzes;
    mapping(address => uint256[]) public userQuizzes; // Track quizzes per user
    mapping(uint256 => QuizStats) public quizStats;
    mapping(uint256 => address[]) public quizParticipants; // Track participants for each quiz

    // Events
    event QuizCreated(uint256 indexed quizId, address indexed creator, string name);
    event QuizJoined(uint256 indexed quizId, address indexed participant);
    event QuizCompleted(uint256 indexed quizId, address indexed winner, uint256 prize);
    event PrizeWithdrawn(address indexed winner, uint256 amount);
    event QuizCancelled(uint256 indexed quizId);
    event RefundIssued(address indexed participant, uint256 amount);
    event QuizTimeExtended(uint256 indexed quizId, uint256 newEndTime);

    function createCourse(string memory _name, uint256 _price) public nonReentrant whenNotPaused {
        lastCourseId++;
        courses[lastCourseId] = Course({
            creatorAddress: msg.sender,
            id: lastCourseId,
            isClosed: false,
            name: _name,
            price: _price
        });
    }

    function getCourse(uint256 _id) public view whenNotPaused returns(Course memory){
        return courses[_id];
    }

    function enrollCourse(uint256 _courseId) public payable nonReentrant whenNotPaused {
        require(msg.value == courses[_courseId].price, "Insufficient amount to enroll course.");
        // Add course to user's courses
        // Add user to course's students
    }

    function createEvent(string memory _name, uint256 _price, uint256 _eventDate) public nonReentrant whenNotPaused {
        lastEventId++;
        events[lastEventId] = Event({
            creatorAddress: msg.sender,
            eventStartDate: _eventDate,
            id: lastEventId,
            name: _name,
            price: _price
        });
    }

    function getEvent(uint256 _id) public view returns(Event memory){
        return events[_id];
    }

    function createGame(string memory _name) public nonReentrant whenNotPaused {
        lastGameId++;
        games[lastGameId] = Game({
            creatorAddress: msg.sender,
            id: lastGameId,
            isClosed: false,
            name:_name
        });
    }

    function getGame(uint256 _id) public view returns(Game memory){
        return games[_id];
    }

    //function getCourses() public view returns(Course[] memory){
    //    return courses;
    //} we can store our all courses, games, events in backend not smart contract.

    // Grant roles
    function setUserRole(bytes32 _role, address _userAddress) public onlyOwner {
        _grantRole(_role, _userAddress);
    }

    function revokeUserRole(bytes32 _role, address _userAddress) public onlyOwner onlyRole(DEFAULT_ADMIN_ROLE) {
        require(hasRole(_role, _userAddress), "User not has this role.");
        _revokeRole(_role, _userAddress);
    }

    // Pause and unpause contract by owner.
    function pause() public whenNotPaused onlyOwner {
        _pause();
    }

    function unpause() public onlyOwner {
        _unpause();
    }


    // Fallback function to prevent receiving Ether
    fallback() external payable {
        revert("Unexpected Ether received");
    }

    receive() external payable {
        revert("Unexpected Ether received");
    }

    function createQuiz(
        string memory _name,
        uint256 _entryFee,
        uint256 _startTime,
        uint256 _endTime
    ) public payable nonReentrant whenNotPaused {
        require(_endTime > _startTime, "End time must be after start time");
        require(msg.value == createGameFee, "Incorrect creation fee");

        uint256 quizId = quizCounter;
        quizCounter++;

        Quiz storage newQuiz = quizzes[quizId];
        newQuiz.creatorAddress = msg.sender;
        newQuiz.id = quizId;
        newQuiz.name = _name;
        newQuiz.entryFee = _entryFee;
        newQuiz.startTime = _startTime;
        newQuiz.endTime = _endTime;
        newQuiz.isActive = true;

        userQuizzes[msg.sender].push(quizId);
        emit QuizCreated(quizId, msg.sender, _name);
    }

    function joinQuiz(uint256 _quizId) public payable nonReentrant whenNotPaused {
        Quiz storage quiz = quizzes[_quizId];
        require(quiz.isActive, "Quiz is not active");
        require(block.timestamp < quiz.endTime, "Quiz has ended");
        require(!quiz.participants[msg.sender], "Already joined");
        require(msg.value == quiz.entryFee, "Incorrect entry fee");

        quiz.participants[msg.sender] = true;
        quiz.participantCount++;
        quiz.prizePool += msg.value;

        userQuizzes[msg.sender].push(_quizId);
        quizParticipants[_quizId].push(msg.sender);
        emit QuizJoined(_quizId, msg.sender);
    }

    function endQuiz(uint256 _quizId, address _winner) public nonReentrant {
        Quiz storage quiz = quizzes[_quizId];
        require(msg.sender == quiz.creatorAddress, "Not authorized user");
        require(quiz.isActive, "Quiz not active");
        require(block.timestamp >= quiz.endTime, "Quiz not ended yet");
        require(quiz.participants[_winner], "Winner must be participant");

        quiz.isActive = false;
        quiz.winner = _winner;

        uint256 prize = quiz.prizePool;
        quiz.prizePool = 0;

        (bool success, ) = payable(_winner).call{value: prize}("");
        require(success, "Transfer failed");

        emit QuizCompleted(_quizId, _winner, prize);
    }

    function getUserQuizzes(address _user) public view returns (uint256[] memory) {
        return userQuizzes[_user];
    }

    function getQuizDetails(uint256 _quizId) public view returns (
        address creatorAddress,
        string memory name,
        uint256 entryFee,
        uint256 prizePool,
        uint256 startTime,
        uint256 endTime,
        bool isActive,
        address winner,
        uint256 participantCount
    ) {
        Quiz storage quiz = quizzes[_quizId];
        return (
            quiz.creatorAddress,
            quiz.name,
            quiz.entryFee,
            quiz.prizePool,
            quiz.startTime,
            quiz.endTime,
            quiz.isActive,
            quiz.winner,
            quiz.participantCount
        );
    }

    // Update withdrawal function to handle contract balance
    function withdrawFees() public onlyOwner nonReentrant {
        uint256 balance = address(this).balance;
        require(balance > 0, "No fees to withdraw");
        
        (bool success, ) = payable(owner()).call{value: balance}("");
        require(success, "Transfer failed");
    }

    function cancelQuiz(uint256 _quizId) public nonReentrant {
        Quiz storage quiz = quizzes[_quizId];
        require(msg.sender == quiz.creatorAddress, "Not authorized user");
        require(quiz.isActive, "Quiz not active");
        require(block.timestamp < quiz.startTime, "Quiz already started");

        quiz.isActive = false;
        
        // Store prize pool before resetting
        uint256 refundAmount = quiz.entryFee;
        quiz.prizePool = 0;

        // Refund all participants using the new mapping
        address[] memory participants = quizParticipants[_quizId];
        for (uint i = 0; i < participants.length; i++) {
            address participant = participants[i];
            if (quiz.participants[participant]) {
                (bool success, ) = payable(participant).call{value: refundAmount}("");
                require(success, "Refund failed");
                emit RefundIssued(participant, refundAmount);
            }
        }

        emit QuizCancelled(_quizId);
    }

    function extendQuizTime(uint256 _quizId, uint256 _additionalTime) 
        public 
        onlyRole(TEACHER_ROLE) 
    {
        Quiz storage quiz = quizzes[_quizId];
        require(quiz.isActive, "Quiz not active");
        require(block.timestamp < quiz.endTime, "Quiz already ended");
        
        quiz.endTime += _additionalTime;
        emit QuizTimeExtended(_quizId, quiz.endTime);
    }

    function updateQuizStats(
        uint256 _quizId, 
        address _participant, 
        uint256 _score
    ) internal {
        QuizStats storage stats = quizStats[_quizId];
        stats.totalParticipants++;
        
        // Update average score
        stats.averageScore = (stats.averageScore * (stats.totalParticipants - 1) + _score) 
            / stats.totalParticipants;
        
        // Update top scorer
        if (_score > stats.topScore) {
            stats.topScore = _score;
            stats.topScorer = _participant;
        }
    }

    function getQuizStats(uint256 _quizId) 
        public 
        view 
        returns (QuizStats memory) 
    {
        return quizStats[_quizId];
    }
}