<?php

namespace App\Services\Workflow;

use RuntimeException;

/** Thrown when a step is not allowed (wrong status, wrong role, bad data). Message is shown to the user. */
class WorkflowException extends RuntimeException {}
