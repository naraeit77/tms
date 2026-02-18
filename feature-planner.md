---
name: feature-planner
description: Creates phase-based feature plans with quality gates and incremental delivery structure.
  Use when planning features, organizing work, breaking down tasks, creating roadmaps,
  or structuring development strategy.
---

---
name: feature-planner
description: >-
  Creates phase-based feature plans with quality gates and incremental delivery structure.
  Use when planning features, organizing work, breaking down tasks, creating roadmaps,
  or structuring development strategy.
keywords:
  - plan
  - planning
  - phases
  - breakdown
  - strategy
  - roadmap
  - organize
  - structure
  - outline
version: 1.0.0

purpose:
  description: Generate structured, phase-based plans
  principles:
    - Each phase delivers complete, runnable functionality
    - Quality gates enforce validation before proceeding
    - User approves plan before any work begins
    - Progress tracked via markdown checkboxes
    - Each phase is 1-4 hours maximum

planning_workflow:
  step_1_requirements_analysis:
    tasks:
      - Read relevant files to understand codebase architecture
      - Identify dependencies and integration points
      - Assess complexity and risks
      - Determine appropriate scope (small/medium/large)

  step_2_phase_breakdown:
    description: Break feature into 3-7 phases
    phase_requirements:
      - Test-First - Write tests BEFORE implementation
      - Delivers working, testable functionality
      - Takes 1-4 hours maximum
      - Follows Red-Green-Refactor cycle
      - Has measurable test coverage requirements
      - Can be rolled back independently
      - Has clear success criteria
    phase_structure:
      phase_name: Clear deliverable
      goal: What working functionality this produces
      test_strategy: What test types, coverage target, test scenarios
      tasks:
        red_tasks: Write failing tests first
        green_tasks: Implement minimal code to make tests pass
        refactor_tasks: Improve code quality while tests stay green
      quality_gate: TDD compliance + validation criteria
      dependencies: What must exist before starting
      coverage_target: Specific percentage or checklist for this phase

  step_3_plan_document_creation:
    template: plan-template.md
    output_path: docs/plans/PLAN_<feature-name>.md
    includes:
      - Overview and objectives
      - Architecture decisions with rationale
      - Complete phase breakdown with checkboxes
      - Quality gate checklists
      - Risk assessment table
      - Rollback strategy per phase
      - Progress tracking section
      - Notes & learnings area

  step_4_user_approval:
    critical: true
    method: Use AskUserQuestion to get explicit approval
    questions:
      - Does this phase breakdown make sense for your project?
      - Any concerns about the proposed approach?
      - Should I proceed with creating the plan document?
    rule: Only create plan document after user confirms approval

  step_5_document_generation:
    tasks:
      - Create docs/plans/ directory if not exists
      - Generate plan document with all checkboxes unchecked
      - Add clear instructions in header about quality gates
      - Inform user of plan location and next steps

quality_gate_standards:
  description: Each phase MUST validate these items before proceeding to next phase

  build_and_compilation:
    - Project builds/compiles without errors
    - No syntax errors

  test_driven_development:
    - Tests written BEFORE production code
    - Red-Green-Refactor cycle followed
    - "Unit tests: ≥80% coverage for business logic"
    - "Integration tests: Critical user flows validated"
    - Test suite runs in acceptable time (<5 minutes)

  testing:
    - All existing tests pass
    - New tests added for new functionality
    - Test coverage maintained or improved

  code_quality:
    - Linting passes with no errors
    - Type checking passes (if applicable)
    - Code formatting consistent

  functionality:
    - Manual testing confirms feature works
    - No regressions in existing functionality
    - Edge cases tested

  security_and_performance:
    - No new security vulnerabilities
    - No performance degradation
    - Resource usage acceptable

  documentation:
    - Code comments updated
    - Documentation reflects changes

progress_tracking_protocol:
  critical_instructions:
    - Check off completed task checkboxes
    - Run all quality gate validation commands
    - Verify ALL quality gate items pass
    - Update "Last Updated" date
    - Document learnings in Notes section
    - Only then proceed to next phase
  warning: DO NOT skip quality gates or proceed with failing checks

phase_sizing_guidelines:
  small_scope:
    phases: 2-3
    total_hours: 3-6
    characteristics:
      - Single component or simple feature
      - Minimal dependencies
      - Clear requirements
    examples:
      - Add dark mode toggle
      - Create new form component

  medium_scope:
    phases: 4-5
    total_hours: 8-15
    characteristics:
      - Multiple components or moderate feature
      - Some integration complexity
      - Database changes or API work
    examples:
      - User authentication system
      - Search functionality

  large_scope:
    phases: 6-7
    total_hours: 15-25
    characteristics:
      - Complex feature spanning multiple areas
      - Significant architectural impact
      - Multiple integrations
    examples:
      - AI-powered search with embeddings
      - Real-time collaboration

risk_assessment:
  risk_types:
    technical_risks:
      - API changes
      - Performance issues
      - Data migration
    dependency_risks:
      - External library updates
      - Third-party service availability
    timeline_risks:
      - Complexity unknowns
      - Blocking dependencies
    quality_risks:
      - Test coverage gaps
      - Regression potential
  risk_attributes:
    probability:
      - Low
      - Medium
      - High
    impact:
      - Low
      - Medium
      - High
    mitigation_strategy: Specific action steps

rollback_strategy:
  description: For each phase, document how to revert changes if issues arise
  considerations:
    - What code changes need to be undone
    - Database migrations to reverse (if applicable)
    - Configuration changes to restore
    - Dependencies to remove

test_specification_guidelines:
  test_first_development_workflow:
    step_1_specify_test_cases:
      description: Before writing ANY code
      questions:
        - What inputs will be tested?
        - What outputs are expected?
        - What edge cases must be handled?
        - What error conditions should be tested?

    step_2_write_tests:
      phase: Red
      tasks:
        - Write tests that WILL fail
        - Verify tests fail for the right reason
        - Run tests to confirm failure
        - Commit failing tests to track TDD compliance

    step_3_implement_code:
      phase: Green
      tasks:
        - Write minimal code to make tests pass
        - Run tests frequently (every 2-5 minutes)
        - Stop when all tests pass
        - No additional functionality beyond tests

    step_4_refactor:
      phase: Blue
      tasks:
        - Improve code quality while tests remain green
        - Extract duplicated logic
        - Improve naming and structure
        - Run tests after each refactoring step
        - Commit when refactoring complete

  test_types:
    unit_tests:
      target: Individual functions, methods, classes
      dependencies: None or mocked/stubbed
      speed: Fast (<100ms per test)
      isolation: Complete isolation from external systems
      coverage: "≥80% of business logic"

    integration_tests:
      target: Interaction between components/modules
      dependencies: May use real dependencies
      speed: Moderate (<1s per test)
      isolation: Tests component boundaries
      coverage: Critical integration points

    end_to_end_tests:
      target: Complete user workflows
      dependencies: Real or near-real environment
      speed: Slow (seconds to minutes)
      isolation: Full system integration
      coverage: Critical user journeys

  coverage_thresholds:
    business_logic: "≥90%"
    data_access_layer: "≥80%"
    api_controller_layer: "≥70%"
    ui_presentation: Integration tests preferred over coverage

  coverage_commands:
    javascript_typescript:
      - jest --coverage
      - nyc report --reporter=html
    python:
      - pytest --cov=src --cov-report=html
      - coverage report
    java:
      - mvn jacoco:report
      - gradle jacocoTestReport
    go:
      - go test -cover ./...
      - go tool cover -html=coverage.out
    dotnet:
      - dotnet test /p:CollectCoverage=true /p:CoverageReporter=html
      - reportgenerator -reports:coverage.xml -targetdir:coverage
    ruby:
      - bundle exec rspec --coverage
      - open coverage/index.html
    php:
      - phpunit --coverage-html coverage

  test_patterns:
    arrange_act_assert:
      description: AAA Pattern
      structure:
        arrange: Set up test data and dependencies
        act: Execute the behavior being tested
        assert: Verify expected outcome

    given_when_then:
      description: BDD Style
      structure:
        given: Initial context/state
        when: Action occurs
        then: Observable outcome

    mocking_stubbing:
      description: Mocking/Stubbing Dependencies
      steps:
        - Create mock/stub
        - Configure mock behavior
        - Execute and verify

  test_documentation_in_plan:
    required_specifications:
      - "Test File Location: Exact path where tests will be written"
      - "Test Scenarios: List of specific test cases"
      - "Expected Failures: What error should tests show initially?"
      - "Coverage Target: Percentage for this phase"
      - "Dependencies to Mock: What needs mocking/stubbing?"
      - "Test Data: What fixtures/factories are needed?"

supporting_files:
  - name: plan-template.md
    description: Complete plan document template