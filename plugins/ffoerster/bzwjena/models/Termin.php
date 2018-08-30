<?php namespace ffoerster\BZWJena\Models;

use Model;

/**
 * Model
 */
class Termin extends Model
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
    public $table = 'ffoerster_bzwjena_termine';

    /**
     * Relations
     */

	public $belongsToMany =[
		'angebote' => [
			'ffoerster\bzwjena\Models\Angebot',

			'table' => 'ffoerster_bzwjena_termin_angebot',

			'order' => 'angebot_title'
		],
		'leitung' => [
			'ffoerster\bzwjena\Models\Team',

			'table' => 'ffoerster_bzwjena_termin_team',

			'order' => 'team_title'
		]
	];

}
