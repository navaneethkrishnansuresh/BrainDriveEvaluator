/**
 * Scenario Bank for BrainDrive Evaluator
 * 
 * Contains 15-20 diverse scenarios representing different user personas
 * for evaluating the WhyFinder AI coaching flow.
 */

import { Scenario } from '../types';

export const defaultScenarios: Scenario[] = [
  {
    id: 'scenario_early_career',
    name: 'Early Career Confusion',
    personaSummary: 'A 25-year-old recent graduate working in marketing but feeling unfulfilled. Questioning if they chose the right path.',
    constraints: [
      'Has student debt of $40,000',
      'Currently living in a high cost city',
      'Family expects them to stay in corporate career',
      'Has a degree in Business Administration',
    ],
    goals: [
      'Find clarity on whether to stay in marketing or pivot',
      'Understand what actually energizes them',
      'Get practical guidance they can act on',
    ],
    conflictPoints: [
      'Passion for creative writing vs. need for stable income',
      'Desire for independence vs. fear of disappointing parents',
      'Want to travel vs. need to pay off debt',
    ],
    redLines: [
      'Cannot invent a spouse or children',
      'Cannot claim expertise they don\'t have',
      'Must stay consistent with the financial situation',
    ],
    starterContext: 'Just got passed over for a promotion and feeling stuck.',
  },
  {
    id: 'scenario_mid_career_burnout',
    name: 'Mid-Career Burnout',
    personaSummary: 'A 38-year-old software engineer who has been in tech for 15 years. Successful but exhausted and questioning everything.',
    constraints: [
      'Has a mortgage and two kids',
      'Spouse works part-time',
      'Golden handcuffs - high salary hard to replicate',
      'Living in Silicon Valley',
    ],
    goals: [
      'Figure out if tech is still right for them',
      'Find sustainable energy in work',
      'Explore what a meaningful career looks like',
    ],
    conflictPoints: [
      'Financial security vs. mental health',
      'Being a good provider vs. being present for family',
      'Technical excellence vs. leadership path',
    ],
    redLines: [
      'Cannot suddenly have no financial responsibilities',
      'Must acknowledge family obligations',
      'Cannot claim to have already solved the problem',
    ],
    starterContext: 'Took a mental health leave from work last month.',
  },
  {
    id: 'scenario_career_changer',
    name: 'Late Career Pivot',
    personaSummary: 'A 52-year-old accountant who has always dreamed of teaching but never pursued it.',
    constraints: [
      'Has 15 years until retirement',
      'Pension tied to current employer',
      'Kids are in college',
      'Spouse is supportive but worried about income',
    ],
    goals: [
      'Explore if teaching is really the dream or just an escape',
      'Find ways to incorporate teaching into life now',
      'Make peace with career choices made',
    ],
    conflictPoints: [
      'Safety of known career vs. adventure of new path',
      'Obligation to family vs. personal fulfillment',
      'Age concerns vs. wisdom and experience',
    ],
    redLines: [
      'Cannot ignore financial realities',
      'Must be honest about age-related concerns',
      'Cannot pretend family doesn\'t matter',
    ],
    starterContext: 'Recently attended a career workshop that sparked this reflection.',
  },
  {
    id: 'scenario_entrepreneur_doubt',
    name: 'Entrepreneur Self-Doubt',
    personaSummary: 'A 32-year-old who left corporate to start a business 2 years ago. Business is surviving but not thriving.',
    constraints: [
      'Burned through most savings',
      'Has 3 employees depending on them',
      'Working 70+ hours per week',
      'Partner is getting frustrated with lack of time together',
    ],
    goals: [
      'Decide if they should keep pushing or go back to corporate',
      'Reconnect with why they started the business',
      'Find sustainable pace',
    ],
    conflictPoints: [
      'Sunk cost vs. cutting losses',
      'Proving doubters wrong vs. admitting struggle',
      'Employee responsibility vs. self-care',
    ],
    redLines: [
      'Cannot suddenly have the business become successful',
      'Must acknowledge the toll on relationships',
      'Cannot ignore financial pressure',
    ],
    starterContext: 'Had a tough conversation with a mentor who suggested shutting down.',
  },
  {
    id: 'scenario_creative_professional',
    name: 'Creative Professional Crisis',
    personaSummary: 'A 29-year-old graphic designer who feels their creativity is being crushed by client work.',
    constraints: [
      'Freelance income is inconsistent',
      'No formal art education',
      'Living in a small apartment in Brooklyn',
      'Has a side project that gets no time',
    ],
    goals: [
      'Find balance between commercial work and personal art',
      'Understand what kind of creativity actually fulfills them',
      'Build a sustainable creative career',
    ],
    conflictPoints: [
      'Commercial success vs. artistic integrity',
      'Client demands vs. personal vision',
      'Hustle culture vs. creative rest',
    ],
    redLines: [
      'Cannot pretend money doesn\'t matter',
      'Must acknowledge imposter syndrome',
      'Cannot claim massive following or success',
    ],
    starterContext: 'Just finished a soul-crushing project for a corporate client.',
  },
  {
    id: 'scenario_parent_returner',
    name: 'Parent Returning to Work',
    personaSummary: 'A 41-year-old who took 8 years off to raise children and is now looking to return to the workforce.',
    constraints: [
      'Skills feel outdated',
      'Gaps in resume',
      'Childcare logistics are complex',
      'Lost professional network',
    ],
    goals: [
      'Figure out what kind of work would be meaningful now',
      'Rebuild confidence after years away',
      'Find work that fits with family life',
    ],
    conflictPoints: [
      'Career ambition vs. family presence',
      'Identity as parent vs. identity as professional',
      'Starting over vs. picking up where left off',
    ],
    redLines: [
      'Cannot ignore childcare realities',
      'Must acknowledge confidence struggles',
      'Cannot pretend the gap doesn\'t exist',
    ],
    starterContext: 'Youngest child just started full-time school.',
  },
  {
    id: 'scenario_healthcare_worker',
    name: 'Healthcare Worker Exhaustion',
    personaSummary: 'A 35-year-old nurse who went into healthcare to help people but is now completely burned out.',
    constraints: [
      'Has nursing license and specialized training',
      'Student loans still being paid',
      'Night shifts affecting health',
      'Feels guilty about wanting to leave',
    ],
    goals: [
      'Explore if there are other ways to help people',
      'Find sustainable work-life balance',
      'Reconnect with original calling',
    ],
    conflictPoints: [
      'Calling to help vs. need for self-preservation',
      'Sunk cost in training vs. new direction',
      'Guilt about leaving vs. recognizing limits',
    ],
    redLines: [
      'Cannot ignore the training investment',
      'Must acknowledge real exhaustion',
      'Cannot pretend healthcare is easy',
    ],
    starterContext: 'Just came off a brutal 12-hour shift with back-to-back emergencies.',
  },
  {
    id: 'scenario_tech_layoff',
    name: 'Tech Layoff Survivor',
    personaSummary: 'A 44-year-old product manager who was just laid off after 12 years at the same company.',
    constraints: [
      'Severance runs out in 4 months',
      'Identity was tied to the job',
      'Job market is tough right now',
      'Has been applying with no responses',
    ],
    goals: [
      'Process the loss and grief',
      'Figure out if this is a chance for reinvention',
      'Rebuild confidence after rejection',
    ],
    conflictPoints: [
      'Need for income vs. desire for meaningful work',
      'Taking any job vs. waiting for right fit',
      'Staying in tech vs. exploring other fields',
    ],
    redLines: [
      'Cannot ignore the urgency',
      'Must acknowledge the emotional impact',
      'Cannot pretend job hunting is going well',
    ],
    starterContext: 'Was part of a 10% workforce reduction last month.',
  },
  {
    id: 'scenario_academic_crossroads',
    name: 'Academic at Crossroads',
    personaSummary: 'A 33-year-old PhD student in their 6th year, questioning if academia is right for them.',
    constraints: [
      'Years invested in specialized research',
      'Limited industry network',
      'Advisor expects them to finish',
      'Academic job market is brutal',
    ],
    goals: [
      'Decide whether to finish the PhD',
      'Explore what skills transfer outside academia',
      'Find clarity on what matters beyond credentials',
    ],
    conflictPoints: [
      'Finishing what you started vs. knowing when to quit',
      'Academic identity vs. broader self-worth',
      'Mentor expectations vs. own path',
    ],
    redLines: [
      'Cannot pretend the PhD doesn\'t matter',
      'Must acknowledge sunk cost feelings',
      'Cannot ignore advisor relationship',
    ],
    starterContext: 'Just failed a dissertation committee review.',
  },
  {
    id: 'scenario_nonprofit_leader',
    name: 'Nonprofit Leader Dilemma',
    personaSummary: 'A 47-year-old executive director of a small nonprofit, feeling the mission but drowning in operations.',
    constraints: [
      'Salary is below market rate',
      'Small team means wearing many hats',
      'Board has high expectations',
      'Deeply believes in the cause',
    ],
    goals: [
      'Find sustainable way to lead without burning out',
      'Reconnect with the mission beyond operations',
      'Decide if it\'s time to move on',
    ],
    conflictPoints: [
      'Mission alignment vs. personal wellbeing',
      'Commitment to team vs. own needs',
      'Guilt about leaving vs. recognizing limits',
    ],
    redLines: [
      'Cannot abandon the mission suddenly',
      'Must acknowledge the real sacrifice',
      'Cannot pretend fundraising is easy',
    ],
    starterContext: 'Just finished a difficult board meeting about budget cuts.',
  },
  {
    id: 'scenario_immigrant_professional',
    name: 'Immigrant Professional',
    personaSummary: 'A 36-year-old software developer who immigrated 5 years ago, struggling to fit in culturally.',
    constraints: [
      'Visa tied to employer',
      'Family back home depends on remittances',
      'Cultural differences at work',
      'Accent sometimes makes communication hard',
    ],
    goals: [
      'Find sense of belonging while staying authentic',
      'Build career without losing cultural identity',
      'Navigate between two worlds',
    ],
    conflictPoints: [
      'Assimilation vs. authenticity',
      'Family expectations vs. personal growth',
      'Career advancement vs. visa limitations',
    ],
    redLines: [
      'Cannot ignore visa constraints',
      'Must acknowledge cultural challenges',
      'Cannot pretend family doesn\'t depend on them',
    ],
    starterContext: 'Was just passed over for a promotion given to a less experienced colleague.',
  },
  {
    id: 'scenario_trades_crossroads',
    name: 'Trades Worker Seeking More',
    personaSummary: 'A 28-year-old electrician who loves the work but feels intellectually unstimulated.',
    constraints: [
      'No college degree',
      'Good income but physically demanding',
      'Union benefits are valuable',
      'Family has blue-collar expectations',
    ],
    goals: [
      'Find ways to grow intellectually',
      'Explore leadership or business opportunities',
      'Feel proud of career choice',
    ],
    conflictPoints: [
      'Physical work vs. desire for mental challenge',
      'Job security vs. entrepreneurial dreams',
      'Family expectations vs. personal ambition',
    ],
    redLines: [
      'Cannot look down on trade work',
      'Must acknowledge the real skills involved',
      'Cannot ignore physical limitations over time',
    ],
    starterContext: 'Just completed a complex commercial project that sparked pride.',
  },
  {
    id: 'scenario_artist_practical',
    name: 'Artist Getting Practical',
    personaSummary: 'A 31-year-old musician who has been pursuing their dream but is starting to question sustainability.',
    constraints: [
      'No steady income',
      'Health insurance is a constant worry',
      'Friends are settling down with careers',
      'Still believes in the art',
    ],
    goals: [
      'Find balance between art and stability',
      'Understand what success really means to them',
      'Make peace with a hybrid path',
    ],
    conflictPoints: [
      'Pure art vs. commercial compromise',
      'Dream vs. reality',
      'Identity as artist vs. need for security',
    ],
    redLines: [
      'Cannot pretend money doesn\'t matter',
      'Must acknowledge real struggles',
      'Cannot abandon the art entirely',
    ],
    starterContext: 'Best friend just got promoted to senior manager at a tech company.',
  },
  {
    id: 'scenario_remote_worker_isolation',
    name: 'Remote Worker Isolation',
    personaSummary: 'A 39-year-old project manager who went remote during pandemic and never went back.',
    constraints: [
      'Lives in a small town now',
      'Team is spread across time zones',
      'Misses human connection',
      'Productivity is high but fulfillment is low',
    ],
    goals: [
      'Find connection and meaning in remote work',
      'Decide if in-person work is needed',
      'Build community outside of work',
    ],
    conflictPoints: [
      'Flexibility vs. connection',
      'Small town peace vs. city energy',
      'Career advancement vs. lifestyle choice',
    ],
    redLines: [
      'Cannot pretend isolation doesn\'t affect them',
      'Must acknowledge the trade-offs',
      'Cannot suddenly move back to city',
    ],
    starterContext: 'Just finished another week without a single video call.',
  },
  {
    id: 'scenario_second_generation',
    name: 'Second Generation Pressure',
    personaSummary: 'A 27-year-old whose parents immigrated and sacrificed everything for their success.',
    constraints: [
      'Expected to pursue prestigious career',
      'Supporting parents financially',
      'Cultural expectations are strong',
      'Interested in social work but it pays poorly',
    ],
    goals: [
      'Honor parents while finding own path',
      'Navigate between cultures',
      'Find permission to pursue passion',
    ],
    conflictPoints: [
      'Parental dreams vs. personal calling',
      'Financial support duty vs. own life',
      'Gratitude vs. resentment',
    ],
    redLines: [
      'Cannot dismiss parents\' sacrifice',
      'Must acknowledge cultural complexity',
      'Cannot pretend they don\'t love their parents',
    ],
    starterContext: 'Parents just asked when they\'re going to medical school.',
  },
];

export function getRandomScenarios(count: number): Scenario[] {
  const shuffled = [...defaultScenarios].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, Math.min(count, shuffled.length));
}

export function getScenarioById(id: string): Scenario | undefined {
  return defaultScenarios.find(s => s.id === id);
}



