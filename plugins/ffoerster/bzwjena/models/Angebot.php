<?php namespace ffoerster\BZWJena\Models;

use Model;

/**
 * Model
 */
class Angebot extends Model
{
    use \October\Rain\Database\Traits\Validation;
    
    /**
     * @var array Validation rules
     */
    public $rules = [
    ];

    /**
     * @var string The database table used by the model.
     */
    public $table = 'ffoerster_bzwjena_angebote';
}
