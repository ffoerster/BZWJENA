<?php namespace ffoerster\BZWJena\Updates;

use Schema;
use October\Rain\Database\Updates\Migration;

class BuilderTableUpdateFfoersterBzwjenaTeam extends Migration
{
    public function up()
    {
        Schema::table('ffoerster_bzwjena_team', function($table)
        {
            $table->boolean('team_type');
            $table->text('team_function')->nullable();
        });
    }
    
    public function down()
    {
        Schema::table('ffoerster_bzwjena_team', function($table)
        {
            $table->dropColumn('team_type');
            $table->dropColumn('team_function');
        });
    }
}
